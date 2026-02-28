/**
 * server/static.ts — Production Static File Server
 *
 * In production, the React client is pre-compiled by Vite into a set of
 * static files (HTML, JavaScript bundles, CSS, images) and placed in the
 * `dist/public/` directory. This module tells Express how to serve those files.
 *
 * This module is only used in production (`NODE_ENV === 'production'`).
 * In development, Vite runs as middleware instead (see vite.ts), which serves
 * files directly from source with Hot Module Replacement (HMR).
 *
 * Two-layer serving strategy:
 *
 *   Layer 1 — `express.static(distPath)`
 *     Serves any file that exists in the build directory verbatim:
 *       GET /assets/index-abc123.js  → serves dist/public/assets/index-abc123.js
 *       GET /favicon.ico             → serves dist/public/favicon.ico
 *     Express sets correct `Content-Type` headers automatically based on the
 *     file extension (`.js` → `application/javascript`, `.css` → `text/css`, etc.)
 *     Express also handles `ETag` and `Last-Modified` headers for browser caching.
 *
 *   Layer 2 — SPA fallback route (`/{*path}`)
 *     Catches any request that layer 1 didn't handle (i.e. the file doesn't exist)
 *     and sends back `index.html` instead. This is the key enabler of Single Page
 *     Application (SPA) routing.
 *
 * Why does a SPA need a fallback?
 *   In a traditional multi-page app, every URL corresponds to a file on the server.
 *   In a SPA, routing is handled entirely in the browser by JavaScript — there is
 *   only one HTML file (`index.html`), and React Router (or wouter, in this app)
 *   reads the URL to decide what to render.
 *
 *   Without the fallback, a user navigating directly to `/event/a3f8c2b1d0` (e.g.
 *   by typing the URL or refreshing the page) would get a 404 — the server has no
 *   file at that path. With the fallback, the server sends `index.html`, the React
 *   app boots, reads the URL, and renders the correct page.
 *
 *   Note: API routes (`/api/*`) are registered BEFORE this middleware in index.ts,
 *   so they take precedence. The fallback only catches paths that don't match any
 *   API route and don't correspond to a static file.
 */

import express, { type Express } from 'express';
import fs from 'fs';
import path from 'path';

/**
 * serveStatic — Configure Express to serve the production client build.
 *
 * @param app - The Express application instance to attach middleware to.
 *
 * `__dirname` is a Node.js global that contains the absolute path of the
 * *directory* containing the current file. In production, after TypeScript
 * compiles, `__dirname` points to `dist/` (or wherever the compiled output
 * lives). `path.resolve(__dirname, 'public')` therefore resolves to the
 * `dist/public/` directory where Vite puts the built client assets.
 *
 * `path.resolve` is preferred over string concatenation because it handles
 * path separators correctly on both Unix (`/`) and Windows (`\`).
 *
 * The existence check (`fs.existsSync(distPath)`) provides a clear error
 * message if the server is started in production mode before running
 * `vite build`. Without it, Express would silently serve nothing and users
 * would just see 404s — a confusing experience to debug.
 */
export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, 'public');
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  /**
   * Serve static files from the build directory.
   *
   * `express.static()` is Express's built-in middleware for serving files from
   * a directory. It handles:
   *   - Mapping URL paths to file paths on disk.
   *   - Setting appropriate Content-Type headers.
   *   - HTTP caching headers (ETag, Last-Modified) for performance.
   *   - Directory index files (if a directory is requested, looks for index.html).
   *
   * If a request comes in and the file exists, this middleware sends it and
   * terminates the middleware chain. If the file doesn't exist, it calls
   * `next()` to pass control to the fallback handler below.
   */
  app.use(express.static(distPath));

  /**
   * SPA fallback — send index.html for all unmatched routes.
   *
   * `/{*path}` is Express 5's syntax for a wildcard route that matches any
   * path. Unlike `*` alone, `/{*path}` matches paths with slashes correctly
   * (e.g. `/event/a3f8c2b1d0`).
   *
   * `res.sendFile()` sends a file as an HTTP response. It sets the correct
   * Content-Type (text/html) and handles streaming the file to the client
   * efficiently. The path must be absolute — `path.resolve(distPath, 'index.html')`
   * constructs an absolute path to the built index.html file.
   *
   * `_req` is prefixed with `_` because the route parameter is required by
   * Express's handler signature but we don't need to inspect the request — any
   * unmatched request should receive the same response.
   */
  app.use('/{*path}', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}
