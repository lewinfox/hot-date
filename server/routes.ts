/**
 * server/routes.ts — HTTP Route Handlers
 *
 * This file registers all API endpoints on the Express application. It is the
 * "controller" layer that sits between incoming HTTP requests and the storage
 * layer (storage.ts).
 *
 * What this file does NOT do:
 *   - Touch the database directly (that's storage.ts's job).
 *   - Define the URL paths or request/response shapes (those live in shared/routes.ts).
 *   - Serve the client-side app (that's static.ts / vite.ts).
 *
 * Responsibility of each route handler:
 *   1. Validate the incoming request body using Zod schemas from `api.*`.
 *   2. Call the appropriate `storage.*` method with the validated data.
 *   3. Send the correct HTTP status code and JSON response.
 *   4. Catch errors and respond with an appropriate error status.
 *
 * Error handling strategy:
 *   - `ZodError` → 400 Bad Request. Sent when the request body doesn't match
 *     the schema (e.g. a required field is missing or has the wrong type).
 *     We report the first validation error only, to keep the response simple.
 *   - Not found → 404. Sent when storage returns `undefined` for a slug lookup.
 *   - Everything else → 500 Internal Server Error. Unexpected failures are caught
 *     here so the server never crashes and always returns valid JSON.
 *
 * Why use `api.*` for paths and schemas?
 *   The `api` object in shared/routes.ts co-locates the method, path, and Zod
 *   schemas for each endpoint. Using them here means the route paths and
 *   validation rules are defined in one place — change it there and every
 *   consumer (server and client) automatically picks it up.
 *
 * Endpoints registered:
 *   POST   /api/events              — Create a new event
 *   GET    /api/events/:slug        — Fetch event + participants + availabilities
 *   PATCH  /api/events/:slug        — Update event date range
 *   POST   /api/events/:slug/participants — Upsert a participant's availability
 */

import type { Express } from 'express';
import type { Server } from 'http';
import { storage } from './storage';
import { api } from '@shared/routes';
import { z } from 'zod';

/**
 * registerRoutes — Attach all API route handlers to the Express app.
 *
 * Receives both `httpServer` (the raw Node.js HTTP server) and `app` (the
 * Express application). The route handlers are registered on `app`; the
 * `httpServer` is returned unchanged, but passing it through this function
 * keeps the signature consistent with `registerRoutes` conventions used in
 * many Express starter templates (where WebSocket upgrade handlers might also
 * be attached to `httpServer`).
 *
 * `async` is required because route handlers call `await storage.*()`.
 * Express supports async handlers — if they throw, Express catches the error
 * via its own middleware. Here we explicitly catch errors ourselves to control
 * the exact HTTP response.
 */
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  /**
   * POST /api/events — Create a new scheduling event.
   *
   * Request body: { title, startDate, endDate } (validated by Zod schema)
   * Success:      201 Created + the new event row (including its generated slug)
   * Errors:       400 if required fields are missing/invalid, 500 otherwise
   *
   * Why 201 and not 200?
   * HTTP 201 means "a resource was created". 200 means "success but nothing new
   * was created". Using the right code lets API clients (and monitoring tools)
   * know that a new database row was inserted, not just a read performed.
   *
   * `api.events.create.input.parse(req.body)` does two things at once:
   *   1. Validates that req.body has the right shape and types.
   *   2. Returns a strongly-typed object, so TypeScript knows exactly what
   *      `input` contains downstream — no `any` casts required.
   * If validation fails, `.parse()` throws a `ZodError` which is caught below.
   */
  app.post(api.events.create.path, async (req, res) => {
    try {
      const input = api.events.create.input.parse(req.body);
      const event = await storage.createEvent(input);
      res.status(201).json(event);
    } catch (err) {
      console.error('Event creation error:', err);
      if (err instanceof z.ZodError) {
        // Zod collects all validation failures in `err.errors`. We report only
        // the first one ([0]) to keep the client-facing message simple.
        // `path.join('.')` converts an array like ['startDate'] to the string
        // 'startDate', which the client can use to highlight the right field.
        res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      } else {
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  });

  /**
   * GET /api/events/:slug — Fetch an event with all participants and their
   * availability data.
   *
   * URL parameter: :slug (a 10-character hex string, e.g. "a3f8c2b1d0")
   * Success:       200 + EventResponse (event + nested participants + availabilities)
   * Errors:        404 if slug not found, 500 otherwise
   *
   * `req.params.slug` is the value Express extracts from the `:slug` placeholder
   * in the route path (defined in `api.events.get.path`). For example, if the
   * request URL is `/api/events/a3f8c2b1d0`, then `req.params.slug` is "a3f8c2b1d0".
   *
   * No request body validation here — GET requests don't have a body, and
   * the slug format doesn't need strict validation (a wrong slug just returns 404).
   *
   * `return res.status(404)...` — the `return` is important! Without it, Express
   * would try to send a second response after the `if` block, causing a
   * "Cannot set headers after they are sent" Node.js error.
   */
  app.get(api.events.get.path, async (req, res) => {
    try {
      const event = await storage.getEventBySlug(req.params.slug);
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }
      res.json(event);
    } catch (err) {
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  /**
   * PATCH /api/events/:slug — Update an event's start and/or end dates.
   *
   * URL parameter: :slug
   * Request body:  { startDate?, endDate? } — both fields are optional (Zod
   *                validates the format if provided)
   * Success:       200 + the updated event row
   * Errors:        400 invalid input, 404 slug not found, 500 otherwise
   *
   * Why PATCH and not PUT?
   * HTTP PUT means "replace the entire resource". PATCH means "apply a partial
   * update". Since we only allow updating dates (not the title or other fields),
   * PATCH is semantically correct. It also matches client-side conventions:
   * `apiRequest('PATCH', ...)` in use-events.ts.
   *
   * `input.startDate` and `input.endDate` may both be `undefined` if neither
   * was included in the request body (Zod's `.optional()` allows this).
   * `storage.updateEventDates` handles partial updates gracefully — it only
   * sets fields that are not `undefined`.
   */
  app.patch(api.events.update.path, async (req, res) => {
    try {
      const input = api.events.update.input.parse(req.body);
      const event = await storage.updateEvent(req.params.slug, input);
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }
      res.json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res
          .status(400)
          .json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      } else {
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  });

  /**
   * POST /api/events/:slug/participants — Upsert a participant's availability.
   *
   * URL parameter: :slug
   * Request body:  { name, availabilities: [{ date, type }] }
   * Success:       200 + the participant record with their saved availabilities
   * Errors:        400 invalid input, 404 event slug not found, 500 otherwise
   *
   * "Upsert" = INSERT if no participant with this name exists for this event,
   * or UPDATE (replace all availability rows) if they do. See storage.ts for
   * the full upsert strategy.
   *
   * Note the three-way error discrimination in the catch block:
   *   1. `ZodError`  — bad request body (missing name, invalid date format, etc.)
   *   2. `Error` with message 'Event not found' — storage throws this explicitly
   *      when the slug doesn't exist. We check the message string because storage
   *      doesn't define a custom error class.
   *   3. Everything else — unexpected failure (DB locked, disk full, etc.)
   *
   * Checking `err instanceof Error` before accessing `err.message` is important
   * because JavaScript can throw anything — including strings and plain objects
   * that don't have a `.message` property. The `instanceof Error` guard ensures
   * TypeScript allows the property access safely.
   */
  app.post(api.participants.createOrUpdate.path, async (req, res) => {
    try {
      const input = api.participants.createOrUpdate.input.parse(req.body);
      const result = await storage.addOrUpdateParticipant(req.params.slug, input);
      res.json(result);
    } catch (err) {
      console.error('Participant update error:', err);
      if (err instanceof z.ZodError) {
        res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      } else if (err instanceof Error && err.message === 'Event not found') {
        res.status(404).json({ message: 'Event not found' });
      } else {
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  });

  return httpServer;
}
