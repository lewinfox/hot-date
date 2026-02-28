/**
 * shared/routes.ts — API Contract Definition
 *
 * This file is the single source of truth for the HTTP API contract between
 * the client and the server. It lives in `shared/` because both sides use it:
 *   - The server (routes.ts) uses `api.*.path` to register Express routes and
 *     `api.*.input` to validate incoming request bodies.
 *   - The client (use-events.ts) uses `api.*.method`, `api.*.path`, and
 *     `buildUrl()` to construct and send the correct HTTP requests.
 *
 * What "API contract" means:
 *   Both sides agree in advance on:
 *     - The HTTP method (GET, POST, PATCH) for each operation.
 *     - The URL path (e.g. `/api/events/:slug`).
 *     - The shape of the request body (defined as a Zod schema in `input`).
 *     - The possible response shapes (defined in `responses`).
 *   By importing from this shared file rather than duplicating the strings and
 *   schemas, we guarantee that the client and server always agree. A path change
 *   only needs to be made in one place.
 *
 * The `api` object structure:
 *   api
 *   ├── events
 *   │   ├── create  — POST   /api/events
 *   │   ├── get     — GET    /api/events/:slug
 *   │   └── update  — PATCH  /api/events/:slug
 *   └── participants
 *       └── createOrUpdate — POST /api/events/:slug/participants
 *
 * `as const` on string literals:
 *   TypeScript normally infers `'POST'` as the broad type `string`. Adding
 *   `as const` narrows it to the literal type `'POST'`. This matters because
 *   the `fetch()` API's `method` option has type `string`, but some typed HTTP
 *   clients or helper functions distinguish between the exact method names.
 *   It also prevents accidental typos when using the value in comparisons.
 */

import { z } from 'zod';
import { insertEventSchema, events } from './schema';

/**
 * errorSchemas — Reusable Zod schemas for standard error response shapes.
 *
 * These describe the JSON bodies that the server sends for error responses.
 * They're used in the `responses` maps within `api` to document what the
 * client should expect on failure.
 *
 * Currently these schemas are not used for runtime validation (the client
 * doesn't validate error responses with Zod), but they serve as documentation
 * and could be wired into a typed HTTP client in the future.
 *
 * `validation` (400 Bad Request):
 *   Sent when `Zod.parse()` fails in a route handler.
 *   `field` is optional — some validation errors apply to the whole body,
 *   not a specific field.
 *
 * `notFound` (404 Not Found):
 *   Sent when a slug lookup returns no results.
 *
 * `internal` (500 Internal Server Error):
 *   Sent when an unexpected error occurs.
 */
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

/**
 * api — The complete API contract object.
 *
 * Each endpoint entry has:
 *   `method`    — The HTTP verb, typed as a literal (e.g. `'POST' as const`).
 *   `path`      — The URL path, with Express-style `:param` placeholders.
 *                 Use `buildUrl()` to substitute real values before fetching.
 *   `input`     — A Zod schema for the request body (only on mutation endpoints).
 *                 The server calls `.parse(req.body)` to validate. If validation
 *                 fails, Zod throws a `ZodError`, caught by the route handler.
 *   `responses` — A map of HTTP status codes to Zod schemas describing possible
 *                 response bodies. Used for documentation and potential future
 *                 runtime validation.
 */
export const api = {
  events: {
    /**
     * create — POST /api/events
     *
     * Creates a new scheduling event. The server generates a random slug and
     * sets `createdAt` automatically — the client provides only the display
     * fields.
     *
     * `input: insertEventSchema` is the Zod schema from schema.ts, picking only
     * the fields the client should provide (title, description, startDate, endDate).
     *
     * `z.custom<typeof events.$inferSelect>()` creates a Zod schema that accepts
     * any value but is typed as the full `Event` row. This is a lightweight way to
     * add TypeScript type information to a response schema without writing a full
     * `z.object({ id: z.number(), slug: z.string(), ... })` definition. The trade-
     * off: no runtime validation of the 201 response (the server is trusted to
     * return the correct shape).
     */
    create: {
      method: 'POST' as const,
      path: '/api/events' as const,
      input: insertEventSchema,
      responses: {
        201: z.custom<typeof events.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },

    /**
     * get — GET /api/events/:slug
     *
     * Fetches a full event with all participants and their availabilities.
     * No `input` field because GET requests don't have a body — the only
     * parameter is the `:slug` in the URL path.
     *
     * `z.any()` is used for the 200 response because the `EventResponse` type
     * (event + nested participants + nested availabilities) is complex and the
     * full Zod schema would be verbose. A comment notes the intended type.
     * The client trusts the server to return the correct shape and uses the
     * `EventResponse` TypeScript type from schema.ts directly.
     */
    get: {
      method: 'GET' as const,
      path: '/api/events/:slug' as const,
      responses: {
        200: z.any(), // EventResponse
        404: errorSchemas.notFound,
      },
    },

    /**
     * update — PATCH /api/events/:slug
     *
     * Updates an event's date range. Both `startDate` and `endDate` are optional
     * (`.optional()`) because PATCH semantics allow partial updates — the caller
     * may want to change only one of the two dates.
     *
     * If neither field is provided, the storage layer will receive two
     * `undefined` values and effectively perform a no-op update (returning the
     * unchanged event row). The client always sends at least one field in practice.
     */
    update: {
      method: 'PATCH' as const,
      path: '/api/events/:slug' as const,
      input: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
      responses: {
        200: z.custom<typeof events.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },

  participants: {
    /**
     * createOrUpdate — POST /api/events/:slug/participants
     *
     * Upserts a participant's availability: inserts if no participant with
     * `name` exists for this event, or replaces all availability rows if they do.
     *
     * `name: z.string().min(1, 'Name is required')`:
     *   `.min(1, ...)` rejects empty strings. The second argument is the error
     *   message that will appear in the 400 response's `message` field if
     *   validation fails. This is what the UI might display to the user.
     *
     * `availabilities: z.array(z.object({ date, type }))`:
     *   An array of availability records. Each entry must have:
     *     - `date`: any string (further format validation could be added here).
     *     - `type`: exactly one of the three enum values. `z.enum([...])` will
     *       reject any other string, producing a validation error.
     *   An empty array (`[]`) is valid — it means the person has no availability.
     */
    createOrUpdate: {
      method: 'POST' as const,
      path: '/api/events/:slug/participants' as const,
      input: z.object({
        name: z.string().min(1, 'Name is required'),
        availabilities: z.array(
          z.object({
            date: z.string(),
            type: z.enum(['all_day', 'morning', 'afternoon']),
          })
        ),
      }),
      responses: {
        200: z.any(), // ParticipantWithAvailabilities
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
};

/**
 * buildUrl — Substitute `:param` placeholders in a path template.
 *
 * Express route paths use colon-prefixed placeholders (e.g. `/api/events/:slug`).
 * These can't be used directly as fetch URLs — the `:slug` must be replaced
 * with the actual slug value before making the HTTP request.
 *
 * Example:
 *   buildUrl('/api/events/:slug', { slug: 'a3f8c2b1d0' })
 *   → '/api/events/a3f8c2b1d0'
 *
 * How it works:
 *   `Object.entries(params)` converts `{ slug: 'a3f8c2b1d0' }` into
 *   `[['slug', 'a3f8c2b1d0']]` — an array of [key, value] pairs.
 *   `.forEach(([key, value]) => ...)` destructures each pair for clarity.
 *   `url.includes(\`:${key}\`)` checks that the placeholder exists before
 *   replacing — this avoids silently discarding params with typos in the key.
 *   `String(value)` converts numbers to strings so numeric IDs work too
 *   (e.g. `{ id: 42 }` → replaces `:id` with `"42"`).
 *
 * @param path   - A path template with Express-style `:param` placeholders.
 * @param params - An object mapping parameter names to replacement values.
 * @returns The path with all matching placeholders substituted.
 */
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
