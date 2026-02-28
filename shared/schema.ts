/**
 * shared/schema.ts — Database Schema and Shared Types
 *
 * This file is the single source of truth for the application's data model.
 * It lives in the `shared/` directory because it is imported by BOTH the
 * server (for database queries and validation) and the client (for type
 * checking API responses).
 *
 * What this file defines:
 *   1. Database table schemas using Drizzle ORM's schema builder.
 *   2. A Zod validation schema for creating events (derived from the table schema).
 *   3. TypeScript types inferred automatically from both of the above.
 *
 * Why define types here rather than writing them manually?
 * TypeScript types are inferred directly from the Drizzle table definitions.
 * This means the database schema and the TypeScript types are always in sync —
 * if you add a column to a table, the TypeScript types update automatically.
 * Writing types by hand would risk them drifting out of sync with the actual
 * database structure.
 *
 * The three tables and their relationships:
 *
 *   events
 *   ├── id          (auto-incremented primary key)
 *   ├── slug        (short random public identifier, used in URLs)
 *   ├── title       (display name)
 *   ├── description (optional text)
 *   ├── startDate   (YYYY-MM-DD, default: today)
 *   ├── endDate     (YYYY-MM-DD, default: 3 months from today)
 *   └── createdAt   (Unix timestamp, auto-set on insert)
 *
 *   participants
 *   ├── id          (auto-incremented primary key)
 *   ├── eventId     (foreign key → events.id)
 *   └── name        (display name of the person)
 *
 *   availabilities
 *   ├── id            (auto-incremented primary key)
 *   ├── eventId       (foreign key → events.id, redundant but avoids joins)
 *   ├── participantId (foreign key → participants.id)
 *   ├── date          (YYYY-MM-DD string)
 *   └── type          ('all_day', 'morning', or 'afternoon')
 *
 * Relationships:
 *   One event has many participants (1:N).
 *   One participant has many availabilities (1:N).
 *   Each availability row = one person is available on one specific date.
 *
 * Why store dates as text (YYYY-MM-DD) rather than Unix timestamps?
 * SQLite doesn't have a native DATE type. Text in ISO format is human-readable,
 * sorts correctly as a string (lexicographic order matches chronological order),
 * and avoids timezone complications that come with Unix timestamps.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * events — The main scheduling event table.
 *
 * `sqliteTable('events', { ... })` tells Drizzle:
 *   - The SQL table name is `events`.
 *   - The column definitions follow as an object.
 *
 * Each column definition chains modifiers:
 *   `.notNull()` — makes the column NOT NULL in SQL (required field).
 *   `.unique()`  — adds a UNIQUE constraint (no two rows can have the same value).
 *   `.primaryKey({ autoIncrement: true })` — INTEGER PRIMARY KEY AUTOINCREMENT
 *     is SQLite's auto-incrementing primary key. Each new row gets the next integer.
 *   `.$defaultFn(() => ...)` — a TypeScript-level default. When inserting a row
 *     without this field, Drizzle calls the function and uses its return value.
 *     This is computed at insert time, not at schema definition time.
 *
 * Column notes:
 *   - `slug`: a short random public identifier (10 hex chars). The UNIQUE constraint
 *     prevents two events from accidentally getting the same slug, though with 40
 *     bits of randomness, collisions are astronomically unlikely.
 *   - `description`: no `.notNull()`, so it's nullable — events don't require a
 *     description.
 *   - `startDate` / `endDate`: stored as YYYY-MM-DD text. Defaults generate the
 *     current date and a date 3 months in the future, respectively.
 *   - `createdAt`: stored as an integer (Unix timestamp in seconds). Drizzle's
 *     `mode: 'timestamp'` tells it to accept a JavaScript `Date` object and
 *     store it as a number.
 */
export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  startDate: text('start_date')
    .notNull()
    .$defaultFn(() => new Date().toISOString().split('T')[0]),
  endDate: text('end_date')
    .notNull()
    .$defaultFn(() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 3);
      return d.toISOString().split('T')[0];
    }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

/**
 * participants — People who have submitted availability for an event.
 *
 * Each row represents one person's participation in one event.
 * `eventId` is a reference to `events.id`, establishing the 1:N relationship.
 * Note: Drizzle supports explicit foreign key constraints via `.references()`,
 * but they're not declared here. SQLite doesn't enforce foreign keys by default
 * (requires `PRAGMA foreign_keys = ON`), and the cascade delete logic is handled
 * manually in storage.ts's `cleanupExpiredEvents`.
 */
export const participants = sqliteTable('participants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  name: text('name').notNull(),
});

/**
 * availabilities — Individual date/time availability records.
 *
 * Each row represents one person being available on one date at one time of day.
 * A participant might have many rows here — one per date they marked.
 *
 * `eventId` is stored redundantly here (it could be looked up via participantId →
 * participant → eventId). The redundancy is a common denormalization trade-off:
 * it makes queries that filter by event faster, avoiding an extra JOIN.
 *
 * `date` — stored as text in YYYY-MM-DD format (e.g. "2025-06-15"). The comment
 * serves as a reminder of the expected format since the text type alone doesn't
 * enforce it (Zod validation in shared/routes.ts handles enforcement).
 *
 * `type` — one of three granularity options:
 *   'all_day'   — the person is available all day.
 *   'morning'   — available in the morning only (rendered as the top half of a cell).
 *   'afternoon' — available in the afternoon only (bottom half).
 *   The default 'all_day' means that if the client doesn't specify a type,
 *   the row is treated as full-day availability.
 */
export const availabilities = sqliteTable('availabilities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  participantId: integer('participant_id').notNull(),
  date: text('date').notNull(), // Format: YYYY-MM-DD
  type: text('type').notNull().default('all_day'), // 'all_day', 'morning', 'afternoon'
});

/**
 * insertEventSchema — Zod validation schema for creating a new event.
 *
 * `createInsertSchema(events)` automatically generates a Zod schema from the
 * Drizzle table definition. It creates a Zod object with one field per column,
 * with types inferred from the column types (text → z.string(), integer → z.number()).
 *
 * `.pick({ title: true, description: true, startDate: true, endDate: true })`
 * selects only the fields the API caller should provide. We omit `id`, `slug`,
 * and `createdAt` because those are generated server-side and shouldn't be
 * accepted from the client.
 *
 * This schema is used in `api.events.create.input` (shared/routes.ts) and
 * validated in the POST /api/events route handler (server/routes.ts).
 */
export const insertEventSchema = createInsertSchema(events).pick({
  title: true,
  description: true,
  startDate: true,
  endDate: true,
});

/**
 * TypeScript type exports.
 *
 * Rather than writing type definitions by hand, we derive them from the schema
 * using TypeScript's type inference. This guarantees they always match the
 * actual data structure.
 *
 * `z.infer<typeof insertEventSchema>` — extracts the TypeScript type that
 * Zod will produce after parsing. For example, if the schema has a required
 * string field `title`, the inferred type has `title: string`.
 *
 * `typeof events.$inferSelect` — Drizzle's utility type representing a row
 * read FROM the database (all columns present, defaults applied). Used for
 * the result of SELECT queries.
 *
 * `typeof events.$inferInsert` would represent a row being written TO the
 * database (nullable columns and columns with defaults are optional). We use
 * this in storage.ts's `updateEventDates` for the `Partial<>` accumulator.
 */

/** Type for a parsed event creation request body (validated by Zod). */
export type InsertEvent = z.infer<typeof insertEventSchema>;

/** Type for a full row from the `events` table (result of a SELECT). */
export type Event = typeof events.$inferSelect;

/** Type for a full row from the `participants` table. */
export type Participant = typeof participants.$inferSelect;

/** Type for a full row from the `availabilities` table. */
export type Availability = typeof availabilities.$inferSelect;

/**
 * availabilityTypeSchema — Zod enum for the three valid availability types.
 *
 * Defining this as a Zod enum (rather than a plain TypeScript union) means the
 * values live in one place and can be reused for runtime validation. The
 * TypeScript type `AvailabilityType` is then derived from the schema via
 * `z.infer<>`, so the two are always in sync — changing this array updates
 * both the runtime validator and the compile-time type simultaneously.
 *
 * The Calendar component uses this type to determine how to render each cell:
 *   'all_day'   — the person is available all day.
 *   'morning'   — available in the morning only (top half of cell).
 *   'afternoon' — available in the afternoon only (bottom half of cell).
 */
export const availabilityTypeSchema = z.enum(['all_day', 'morning', 'afternoon']);

/** Derived TypeScript type — always in sync with `availabilityTypeSchema`. */
export type AvailabilityType = z.infer<typeof availabilityTypeSchema>;

/**
 * participantWithAvailabilitiesSchema — Zod schema for a participant row with
 * their availabilities nested.
 *
 * `createSelectSchema(participants)` auto-generates a Zod schema from the
 * Drizzle table definition — all columns become typed Zod fields. We then
 * call `.extend({ availabilities: ... })` to add the nested array that doesn't
 * exist as a column (it's assembled in storage.ts from a separate query).
 *
 * The `availabilities` items reuse `availabilityTypeSchema` for the `type`
 * field, keeping the enum values in one place.
 *
 * This schema is used in routes.ts as the response schema for the
 * `participants.createOrUpdate` endpoint, replacing the previous `z.any()`.
 */
export const participantWithAvailabilitiesSchema = createSelectSchema(participants).extend({
  availabilities: z.array(z.object({ date: z.string(), type: availabilityTypeSchema })),
});

/** Derived TypeScript type — always in sync with the Zod schema above. */
export type ParticipantWithAvailabilities = z.infer<typeof participantWithAvailabilitiesSchema>;

/**
 * eventResponseSchema — Zod schema for the full event API response.
 *
 * `createSelectSchema(events)` gives us the event row fields, then `.extend()`
 * adds the `participants` array (each participant carrying their availabilities),
 * mirroring the nested structure assembled by `storage.getEventBySlug`.
 *
 * Used in routes.ts as the response schema for the `events.get` endpoint.
 */
export const eventResponseSchema = createSelectSchema(events).extend({
  participants: z.array(participantWithAvailabilitiesSchema),
});

/** Derived TypeScript type — always in sync with the Zod schema above. */
export type EventResponse = z.infer<typeof eventResponseSchema>;

/**
 * CreateParticipantRequest — The expected request body for POST
 * /api/events/:slug/participants.
 *
 * Note: This type is NOT derived from a Drizzle table schema. It's defined
 * manually because the request combines data destined for two tables
 * (participants and availabilities) and the shape doesn't map 1:1 to any
 * single table definition.
 *
 * The corresponding Zod schema (for runtime validation) is defined in
 * shared/routes.ts as `api.participants.createOrUpdate.input`.
 */
export type CreateParticipantRequest = {
  name: string;
  availabilities: { date: string; type: AvailabilityType }[];
};
