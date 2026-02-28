/**
 * server/vite.ts — Development Vite Middleware Integration
 *
 * In development, this file plugs Vite into Express so that:
 *   - The client's source TypeScript/TSX files are served directly (no build step).
 *   - Vite transforms imports on the fly (resolves bare module specifiers like
 *     `import React from 'react'` into actual browser-compatible code).
 *   - Hot Module Replacement (HMR) lets the browser update components without a
 *     full page reload when source files change.
 *
 * This is only used in development. In production, the client is pre-built by
 * `vite build` into static files served by static.ts.
 *
 * Why integrate Vite into Express rather than running them as separate servers?
 *   Running two servers (Express on port 5000, Vite on port 5173) would require
 *   configuring CORS and proxying API requests — extra complexity. By running
 *   Vite in "middleware mode" inside Express, both the API and the frontend are
 *   served from the same origin (same port), which simplifies everything.
 *
 * "Middleware mode" means Vite doesn't start its own HTTP server. Instead, it
 * exposes a `vite.middlewares` object (a Connect-compatible middleware stack)
 * that Express can mount. All requests flow through Express first; Vite handles
 * the ones for source files.
 *
 * Hot Module Replacement (HMR):
 *   HMR requires a persistent WebSocket connection between the browser and the
 *   server. When a file changes, Vite pushes an update message over the WebSocket,
 *   and the browser replaces only the changed module without reloading the page.
 *   The WebSocket is handled at the HTTP server level (not Express), which is why
 *   `setupVite` receives the raw `Server` object (from Node.js's `http` module)
 *   in addition to the `Express` app.
 */

import { type Express } from 'express';
import { createServer as createViteServer, createLogger } from 'vite';
import { type Server } from 'http';
import viteConfig from '../vite.config';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

/**
 * viteLogger — Vite's built-in logging instance.
 *
 * `createLogger()` creates the same logger Vite uses internally, which formats
 * messages with colour coding and level prefixes. We use it as the base for a
 * custom logger below that overrides only the `error` method.
 */
const viteLogger = createLogger();

/**
 * setupVite — Mount Vite's dev middleware onto Express.
 *
 * @param server - The raw Node.js HTTP server (needed for HMR WebSocket setup).
 * @param app    - The Express application instance.
 *
 * This function is `async` because `createViteServer` is async — it reads the
 * vite config, resolves plugins, and initialises the module graph before
 * returning. We must `await` it to ensure Vite is ready before registering
 * the fallback handler.
 */
export async function setupVite(server: Server, app: Express) {
  /**
   * HMR server configuration.
   *
   * `middlewareMode: true` — Don't start Vite's own HTTP server. Use Express instead.
   *
   * `hmr: { server, path: '/vite-hmr' }` — Attach the HMR WebSocket handler to our
   *   existing HTTP server. The `path` tells Vite which URL path to use for the
   *   WebSocket connection (`ws://localhost:5000/vite-hmr`). Using a specific path
   *   prevents conflicts with any WebSocket endpoints the app might define.
   *
   * `allowedHosts: true` — Permit connections from any hostname. In development
   *   (e.g. inside a Docker container or Codespace), the server may be accessed
   *   via a non-localhost hostname. Restricting to specific hosts would break
   *   those setups.
   */
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: '/vite-hmr' },
    allowedHosts: true as const,
  };

  /**
   * Create the Vite dev server instance.
   *
   * `...viteConfig` spreads the project's vite.config.ts settings (plugins,
   * aliases, etc.) so Vite behaves consistently in both modes.
   *
   * `configFile: false` prevents Vite from also reading vite.config.ts from
   * disk — we've already loaded it programmatically above, so reading it again
   * would cause duplicate plugin registration.
   *
   * `customLogger` — We override only the `error` method. When Vite encounters
   * a fatal error (e.g. a plugin failure), we call `process.exit(1)` to crash
   * the server immediately rather than leaving it in a broken state. The spread
   * `...viteLogger` preserves the other log levels (info, warn, warnOnce) unchanged.
   *
   * `appType: 'custom'` tells Vite not to add its own HTML-serving middleware.
   * We handle HTML serving ourselves in the fallback route below, giving us
   * control over the cache-busting trick.
   */
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: 'custom',
  });

  /**
   * Mount Vite's middleware stack on Express.
   *
   * `vite.middlewares` is a Connect-compatible middleware stack that handles:
   *   - Serving source files (`.tsx`, `.ts`, `.css`, etc.) with on-the-fly transforms.
   *   - Resolving bare module imports to node_modules paths.
   *   - Serving the HMR client script injected into index.html.
   *   - Responding to module preload requests.
   *
   * Express's `app.use()` can accept any Connect-compatible middleware, so
   * `vite.middlewares` slots in transparently. If Vite can't handle a request
   * (e.g. an API route), it calls `next()` and Express routes it normally.
   */
  app.use(vite.middlewares);

  /**
   * SPA fallback — serve index.html for all non-asset, non-API routes.
   *
   * `/{*path}` is a wildcard route (Express 5 syntax) that matches any path.
   * It runs AFTER `vite.middlewares` and AFTER the API routes registered in
   * routes.ts, so it only catches requests for frontend pages (e.g. `/`,
   * `/event/a3f8c2b1d0`).
   *
   * Why not just use `vite.middlewares` to serve index.html?
   * We want to apply two custom modifications before serving the HTML:
   *   1. `nanoid()` cache-busting (explained below).
   *   2. `vite.transformIndexHtml(url, template)` — Vite processes the HTML,
   *      injecting the HMR client script (`<script type="module">`) and any
   *      other transforms that plugins require.
   *
   * `req.originalUrl` vs `req.path`:
   *   `req.path` strips the mount point prefix, while `req.originalUrl` contains
   *   the full URL including query string. Passing `req.originalUrl` to
   *   `vite.transformIndexHtml` lets Vite plugins that inspect the URL (e.g. for
   *   SSR routing) see the complete, unmodified URL.
   */
  app.use('/{*path}', async (req, res, next) => {
    const url = req.originalUrl;

    try {
      /**
       * Read index.html from disk on every request (not cached in memory).
       *
       * `import.meta.dirname` is the directory of the current file (the
       * server/vite.ts module). Resolving `'..', 'client', 'index.html'` goes
       * up one level to the project root, then into the client directory.
       *
       * Reading from disk on each request (instead of caching the file content)
       * ensures that if index.html itself changes (e.g. a developer adds a
       * `<meta>` tag), the server picks it up without a restart.
       *
       * `await fs.promises.readFile(...)` is the async version of `fs.readFileSync`.
       * Using the async version avoids blocking the Node.js event loop while
       * reading the file, which would pause all other concurrent requests.
       */
      const clientTemplate = path.resolve(import.meta.dirname, '..', 'client', 'index.html');

      let template = await fs.promises.readFile(clientTemplate, 'utf-8');

      /**
       * Cache-busting: inject a unique query string onto the main.tsx import.
       *
       * `nanoid()` generates a short random ID (e.g. "V1StGXR8_Z5jdHi6B-myT").
       * Appending it to the script src as `?v=...` changes the URL on every
       * request, ensuring the browser never uses a cached version of main.tsx.
       *
       * Why is this needed in development?
       * Some browsers aggressively cache ES module scripts. Without cache-busting,
       * a developer might edit a file but the browser would load the old cached
       * version. Adding `?v=<unique>` forces the browser to treat it as a new
       * resource each time, guaranteeing fresh code on every page load.
       *
       * This is a `string.replace()` call — it finds the literal text
       * `src="/src/main.tsx"` in the HTML and replaces it with the versioned
       * variant. This works because the `index.html` file contains exactly
       * that string as Vite's entry point declaration.
       */
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);

      /**
       * Let Vite transform the HTML before serving it.
       *
       * `vite.transformIndexHtml(url, template)` applies Vite's HTML pipeline:
       *   - Injects the HMR client script (`/@vite/client`) so the browser can
       *     connect to the HMR WebSocket and receive hot updates.
       *   - Runs any HTML transform hooks registered by Vite plugins.
       *   - Resolves and injects module preload links.
       *
       * The result (`page`) is the fully-processed HTML string, ready to send.
       */
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(page);
    } catch (e) {
      /**
       * `vite.ssrFixStacktrace(e)` rewrites the error's stack trace to use
       * the original source file paths (as written in TypeScript/TSX) rather
       * than the compiled/transpiled paths. This makes development errors much
       * easier to debug — you see the line in your source file, not in Vite's
       * internal transform output.
       *
       * `next(e)` passes the error to Express's error handler (the four-parameter
       * middleware registered in index.ts), which logs it and returns a 500 response.
       */
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
