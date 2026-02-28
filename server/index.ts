/**
 * server/index.ts — Application Entry Point and Server Bootstrap
 *
 * This is the first file Node.js executes when the server starts. It is
 * responsible for wiring everything together:
 *
 *   1. Create an Express application and an HTTP server.
 *   2. Register body-parsing middleware (JSON, URL-encoded forms).
 *   3. Register a request-logging middleware for API routes.
 *   4. Register all API route handlers (POST/GET/PATCH endpoints).
 *   5. Register a catch-all error handler for unhandled exceptions.
 *   6. Mount the frontend — either via Vite's dev server (development) or
 *      by serving the built static files (production).
 *   7. Schedule periodic database cleanup.
 *   8. Start listening on the configured port.
 *
 * Why separate Express (`app`) from the HTTP server (`httpServer`)?
 * Express provides the high-level routing API. Node.js's `createServer` gives
 * us the raw HTTP server object. We need both because Vite's development
 * HMR (Hot Module Replacement) attaches a WebSocket upgrade handler directly
 * to the Node.js HTTP server, not to Express. See vite.ts for details.
 *
 * Middleware order matters in Express. Middleware is processed in the order
 * it's registered. The logging middleware must come BEFORE route handlers so
 * it can observe all requests. The error handler must come AFTER route handlers
 * so it can catch their errors. The frontend catch-all (Vite or static) must
 * come LAST so that API routes take precedence over it.
 */

import express, { type Request, Response, NextFunction } from 'express';
import { registerRoutes } from './routes';
import { serveStatic } from './static';
import { createServer } from 'http';
import { storage } from './storage';

/**
 * `app` — The Express application instance.
 *
 * Express is a minimal web framework for Node.js. An "application" in Express
 * is just an object with methods for registering middleware (`app.use`) and
 * route handlers (`app.get`, `app.post`, etc.).
 *
 * `httpServer` — The raw Node.js HTTP server.
 *
 * `createServer(app)` creates a Node.js HTTP server that delegates every
 * request to Express. The `httpServer` reference lets us attach WebSocket
 * handlers (for Vite HMR) and call `httpServer.listen()` to start the server.
 */
const app = express();
const httpServer = createServer(app);

/**
 * Module augmentation for `http.IncomingMessage`.
 *
 * TypeScript's type definitions for Node.js's `IncomingMessage` (the `req`
 * object in HTTP handlers) don't include a `rawBody` property — because it
 * doesn't exist by default. The `declare module` block here "augments" the
 * existing type definition to add our custom property.
 *
 * This is needed so that `req.rawBody = buf` in the `express.json()` middleware
 * below doesn't cause a TypeScript type error. The raw body buffer is stored
 * on the request in case any route handler needs to verify a webhook signature
 * or inspect the original bytes of the request body.
 *
 * Note: Module augmentation only affects TypeScript's type checking — it has
 * no runtime effect. The `rawBody` property only exists if the `verify`
 * callback actually assigns it.
 */
declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

/**
 * express.json() — Parse JSON request bodies.
 *
 * HTTP requests can include a body (a blob of data sent alongside the method
 * and headers). For POST/PATCH requests, clients send JSON. Without this
 * middleware, `req.body` would be `undefined`. With it, Express automatically
 * parses the JSON string and makes the resulting object available as `req.body`.
 *
 * The `verify` callback receives the raw buffer (`buf`) before it's parsed.
 * Storing `buf` on `req.rawBody` lets downstream code (e.g. a webhook handler)
 * verify a HMAC signature against the original bytes, since the parsed object
 * may differ from the raw text if the client sent non-canonical JSON.
 */
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

/**
 * express.urlencoded() — Parse URL-encoded form bodies.
 *
 * HTML forms with `method="post"` submit data as `application/x-www-form-urlencoded`
 * (e.g. `name=Alice&email=alice%40example.com`). This middleware parses that
 * format into `req.body`, just like `express.json()` does for JSON.
 *
 * `extended: false` uses the simpler querystring parser (which handles flat
 * key-value pairs) rather than the `qs` library (which handles nested objects).
 * Our forms are simple, so the basic parser is sufficient.
 *
 * This app doesn't currently use HTML form submissions (the client sends JSON),
 * but it's included as a defensive measure.
 */
app.use(express.urlencoded({ extended: false }));

/**
 * log — Timestamped console logging helper.
 *
 * Exported so that other modules (e.g. the cleanup scheduler) can emit
 * consistently formatted log lines. The `source` parameter adds context:
 *   log('Server started')           → "10:30:00 AM [express] Server started"
 *   log('Cleaned up 3 events', 'cleanup') → "10:30:00 AM [cleanup] Cleaned up 3 events"
 *
 * `toLocaleTimeString` formats the current time as a human-readable string
 * in the local timezone. The options request 12-hour format with seconds:
 *   { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }
 */
export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Request logging middleware — Log each API request after it completes.
 *
 * This middleware intercepts every request to produce a log line like:
 *   "10:30:01 AM [express] POST /api/events 201 in 14ms :: {"id":1,"slug":"a3f8c2b1d0"}"
 *
 * It only logs `/api` routes (not the frontend assets), to avoid log noise.
 *
 * How it works (the "monkey-patching" technique):
 *   Express's `res.json()` is the method route handlers call to send a JSON
 *   response. We replace it temporarily with our own function that:
 *     1. Captures the response body for logging.
 *     2. Calls the original `res.json()` to actually send the response.
 *   This is called "monkey-patching" — modifying an object's method at runtime.
 *   It lets us observe the response body without disrupting the normal flow.
 *
 * Why use `res.on('finish', ...)` instead of logging inline?
 *   The `finish` event fires after the response is completely sent to the client.
 *   At that point we know the final status code, which isn't set until the route
 *   handler calls `res.status(...)`. Logging inline (before `next()`) would
 *   always show status 200 because the handler hasn't run yet.
 *
 * `next()` at the end passes control to the next middleware. Without it,
 * Express would stop here and never reach the route handlers.
 */
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Save a reference to the original res.json, then replace it with a wrapper.
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    // `originalResJson.apply(res, [...])` calls the original function with `res`
    // as `this`. This is necessary because `res.json` internally references
    // `this` to access other response methods. Simply calling `originalResJson()`
    // would lose the correct `this` binding.
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (path.startsWith('/api')) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

/**
 * Immediately Invoked Async Function Expression (IIFE).
 *
 * The `(async () => { ... })()` pattern wraps the startup sequence in an
 * async function so we can use `await`. Node.js's top-level module code is
 * synchronous, so without this wrapper we couldn't `await registerRoutes()`
 * or `await setupVite()`. The function is invoked immediately (the trailing
 * `()`) so it runs as soon as the module loads.
 *
 * Why is registration async?
 * `registerRoutes` and `setupVite` are async because they may need to perform
 * I/O (e.g. reading files, setting up WebSockets) before they're ready.
 * We must `await` them to ensure everything is fully initialised before the
 * server starts accepting requests on `httpServer.listen(...)`.
 */
(async () => {
  await registerRoutes(httpServer, app);

  /**
   * Global Express error handler.
   *
   * Express error-handling middleware is distinguished by having FOUR parameters
   * instead of three: `(err, req, res, next)`. When any route handler throws
   * an exception or calls `next(err)`, Express skips all normal middleware and
   * jumps straight to this handler.
   *
   * This is a last-resort handler. Our route handlers already catch their own
   * errors and return appropriate responses. This handler exists to catch any
   * errors that slip through — e.g. middleware bugs or thrown errors from
   * third-party libraries.
   *
   * `_req` is prefixed with `_` to signal that it's intentionally unused —
   * TypeScript's strict mode would otherwise warn about an unused parameter.
   *
   * `if (res.headersSent)` guards against sending a second response when
   * headers have already been written. Calling `next(err)` in that case lets
   * Express handle the partially-sent response gracefully (it will close the
   * connection).
   */
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    console.error('Internal Server Error:', err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  /**
   * Frontend serving — development vs production.
   *
   * The frontend must be mounted AFTER the API routes. Both Vite's dev server
   * and the static file handler include a catch-all fallback that serves
   * `index.html` for any path they don't recognise. If mounted first, the
   * catch-all would intercept `/api/events` requests before Express routes
   * could handle them.
   *
   * Development (`NODE_ENV !== 'production'`):
   *   Vite runs in "middleware mode" — it serves JS/CSS files, processes
   *   imports, and injects the HMR (Hot Module Replacement) client script.
   *   HMR lets the browser update React components without a full page reload.
   *   `setupVite` is dynamically imported (`await import('./vite')`) to avoid
   *   bundling Vite's large dependency tree into the production build.
   *
   * Production (`NODE_ENV === 'production'`):
   *   The client has been pre-built into static files (HTML, JS, CSS) in
   *   `dist/public/`. `serveStatic` uses Express's built-in static file
   *   middleware to serve them, plus a fallback that sends `index.html` for
   *   unknown paths (enabling client-side routing to work on page refresh).
   */
  if (process.env.NODE_ENV === 'production') {
    serveStatic(app);
  } else {
    const { setupVite } = await import('./vite');
    await setupVite(httpServer, app);
  }

  /**
   * Periodic database cleanup.
   *
   * Removes events whose end date is more than `cleanupGraceDays` days in the
   * past, along with all their participants and availabilities. This prevents
   * the SQLite database from growing indefinitely over time.
   *
   * `EVENT_CLEANUP_DAYS` defaults to 30. To change it, set the environment
   * variable before starting the server: `EVENT_CLEANUP_DAYS=7 node server`.
   *
   * `parseInt(str, 10)` converts the string environment variable to an integer.
   * The second argument (the radix `10`) ensures decimal parsing — without it,
   * strings starting with "0" could be parsed as octal in some engines.
   *
   * `runCleanup()` is called once immediately on startup (to handle any events
   * that expired while the server was offline), then again every 24 hours via
   * `setInterval`. `setInterval` returns a timer ID that could be used to cancel
   * the interval with `clearInterval()`, but we don't need to here because the
   * interval should run for the lifetime of the server process.
   */
  const cleanupGraceDays = parseInt(process.env.EVENT_CLEANUP_DAYS || '30', 10);
  const runCleanup = async () => {
    const deleted = await storage.cleanupExpiredEvents(cleanupGraceDays);
    if (deleted > 0) log(`Cleaned up ${deleted} expired event(s)`, 'cleanup');
  };
  runCleanup();
  setInterval(runCleanup, 24 * 60 * 60 * 1000);

  /**
   * Start listening for HTTP connections.
   *
   * `PORT` is an environment variable conventionally used by hosting platforms
   * (Heroku, Railway, Render, etc.) to tell the app which port to bind.
   * Defaulting to 5000 makes local development predictable.
   *
   * `host: '0.0.0.0'` binds to all network interfaces, not just localhost.
   * This is required for Docker containers and cloud deployments where the
   * server must accept connections from outside the host machine. Binding to
   * `127.0.0.1` (localhost) would make the server unreachable from outside.
   *
   * `reusePort: true` allows multiple processes to bind the same port
   * (useful for zero-downtime restarts in production). It has no effect in
   * development.
   *
   * The callback `() => { log(...) }` fires once, when the server is ready to
   * accept connections — confirming to the developer that startup succeeded.
   */
  const port = parseInt(process.env.PORT || '5000', 10);
  httpServer.listen(
    {
      port,
      host: '0.0.0.0',
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    }
  );
})();
