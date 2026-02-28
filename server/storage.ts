/**
 * server/storage.ts — Data Access Layer
 *
 * This file is the only place in the server that touches the database.
 * All business logic that involves reading or writing data goes through the
 * `storage` object exported at the bottom. Route handlers in `routes.ts`
 * call `storage.*` methods and never import `db` directly.
 *
 * This separation is a common server architecture pattern called the
 * "repository pattern". Benefits:
 *   - Route handlers stay thin: they validate input, call storage, format output.
 *   - If the database or ORM ever changes, only this file needs updating.
 *   - The `IStorage` interface makes it possible to swap in a mock implementation
 *     for testing without touching any route code.
 *
 * Data model (three tables, defined in shared/schema.ts):
 *
 *   events           — one row per scheduling event (title, slug, date range)
 *   participants     — one row per person who has submitted availability
 *   availabilities   — one row per (participant, date) pair they marked
 *
 * Relationships:
 *   event 1 → N participants
 *   participant 1 → N availabilities
 */

import { db } from './db';
import { events, participants, availabilities } from '@shared/schema';
import type {
  InsertEvent,
  Event,
  Participant,
  Availability,
  EventResponse,
  ParticipantWithAvailabilities,
  CreateParticipantRequest,
  AvailabilityType,
} from '@shared/schema';
import { eq, inArray, and, lt } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * IStorage — The public interface (contract) for the storage layer.
 *
 * An interface in TypeScript describes the *shape* of an object without
 * providing any implementation. Any class that `implements IStorage` must
 * provide all methods with exactly these signatures.
 *
 * This is what makes the storage layer swappable: a test suite could
 * implement `IStorage` with an in-memory Map instead of a real database,
 * and the route tests would work identically.
 */
export interface IStorage {
  createEvent(event: InsertEvent): Promise<Event>;
  getEventBySlug(slug: string): Promise<EventResponse | undefined>;
  updateEventDates(slug: string, startDate?: string, endDate?: string): Promise<Event | undefined>;
  addOrUpdateParticipant(
    slug: string,
    req: CreateParticipantRequest
  ): Promise<ParticipantWithAvailabilities>;
  cleanupExpiredEvents(graceDays: number): Promise<number>;
}

/**
 * DatabaseStorage — The SQLite-backed implementation of IStorage.
 *
 * All methods are `async` because Drizzle's query builder returns Promises,
 * even though better-sqlite3 is synchronous under the hood. The Promise
 * wrapper keeps the interface consistent with async databases (e.g. Postgres).
 */
export class DatabaseStorage implements IStorage {
  /**
   * createEvent — Insert a new event row and return it.
   *
   * Generates a short random slug (10 hex characters, e.g. "a3f8c2b1d0") that
   * becomes the event's public URL identifier. Using `crypto.randomUUID()` as
   * the entropy source produces a 128-bit random value; we strip hyphens and
   * take the first 10 characters, giving us 40 bits of randomness — sufficient
   * to make collisions astronomically unlikely in practice.
   *
   * Drizzle's `.returning()` causes the INSERT to return the newly created row
   * (including the auto-generated `id` and `createdAt`). The destructured
   * `[event]` takes the first element of the returned array — INSERT always
   * creates exactly one row here, so the array always has one element.
   */
  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const slug = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const [event] = await db
      .insert(events)
      .values({ ...insertEvent, slug })
      .returning();
    return event;
  }

  /**
   * getEventBySlug — Fetch a full event with all participants and their
   * availabilities, or return undefined if the slug doesn't exist.
   *
   * This is the most complex query in the app. Rather than a single JOIN
   * (which would produce many duplicated rows when an event has multiple
   * participants and availabilities), we use three separate SELECT queries:
   *
   *   1. Fetch the event row by slug.
   *   2. Fetch all participants for that event.
   *   3. Fetch all availabilities for those participants in one batch.
   *
   * Step 3 uses `inArray(availabilities.participantId, participantIds)` which
   * generates `WHERE participant_id IN (1, 2, 3, ...)` — a single query for
   * all participants rather than N queries (one per participant).
   *
   * The final `.map()` reshapes the flat availabilities array into a nested
   * structure: each participant gets an `availabilities` array containing only
   * their own rows, filtered by `participantId`.
   *
   * We short-circuit early if there are no participants, returning an empty
   * array rather than running the availabilities query unnecessarily.
   */
  async getEventBySlug(slug: string): Promise<EventResponse | undefined> {
    const [event] = await db.select().from(events).where(eq(events.slug, slug));
    if (!event) return undefined;

    const eventParticipants = await db
      .select()
      .from(participants)
      .where(eq(participants.eventId, event.id));

    if (eventParticipants.length === 0) {
      return { ...event, participants: [] };
    }

    const participantIds = eventParticipants.map((p) => p.id);
    const eventAvailabilities = await db
      .select()
      .from(availabilities)
      .where(inArray(availabilities.participantId, participantIds));

    // For each participant, filter the availabilities array to only their rows
    // and reshape each row to the { date, type } format the client expects.
    const participantsWithDates = eventParticipants.map((p) => ({
      ...p,
      availabilities: eventAvailabilities
        .filter((a) => a.participantId === p.id)
        .map((a) => ({ date: a.date, type: a.type as AvailabilityType })),
    }));

    return { ...event, participants: participantsWithDates };
  }

  /**
   * updateEventDates — Patch an event's startDate and/or endDate.
   *
   * Uses a `Partial<...>` accumulator object (`updates`) to only include the
   * fields that were actually provided. This prevents overwriting a field with
   * `undefined` when the caller only wants to update one of the two dates.
   *
   * `typeof events.$inferInsert` is Drizzle's way of saying "the TypeScript
   * type of a row you'd INSERT into the events table". `Partial<>` makes all
   * fields optional so we can build it up incrementally.
   *
   * Returns `undefined` (not an error) when the slug isn't found, so the
   * caller (the route handler) can respond with a 404 instead.
   */
  async updateEventDates(
    slug: string,
    startDate?: string,
    endDate?: string
  ): Promise<Event | undefined> {
    const updates: Partial<typeof events.$inferInsert> = {};
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate !== undefined) updates.endDate = endDate;

    const [event] = await db.update(events).set(updates).where(eq(events.slug, slug)).returning();
    return event;
  }

  /**
   * cleanupExpiredEvents — Delete events whose end date is more than
   * `graceDays` in the past, along with all their participants and availabilities.
   *
   * This is called periodically by the cleanup scheduler in index.ts to prevent
   * the database from growing indefinitely.
   *
   * Deletion order matters because of foreign key relationships:
   *   1. Delete availabilities (they reference participants)
   *   2. Delete participants (they reference events)
   *   3. Delete events
   *
   * Deleting in the wrong order (e.g. events first) would leave orphaned
   * participant and availability rows.
   *
   * `cutoffStr` is formatted as YYYY-MM-DD. Since dates are stored as text in
   * this same format, the `lt(events.endDate, cutoffStr)` comparison works
   * correctly via lexicographic string ordering (e.g. "2025-01-01" < "2025-03-15").
   *
   * Returns the count of deleted events so the caller can log it.
   */
  async cleanupExpiredEvents(graceDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - graceDays);
    // ISO string looks like "2025-03-15T00:00:00.000Z"; .slice(0,10) gives "2025-03-15"
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Identify expired event IDs first (we need them for cascading deletes below).
    const expired = await db
      .select({ id: events.id })
      .from(events)
      .where(lt(events.endDate, cutoffStr));

    if (expired.length === 0) return 0;

    const expiredIds = expired.map((e) => e.id);

    // Find all participant IDs belonging to expired events so we can delete
    // their availabilities. We need these IDs because availabilities are
    // linked by participantId, not eventId.
    const expiredParticipants = await db
      .select({ id: participants.id })
      .from(participants)
      .where(inArray(participants.eventId, expiredIds));

    if (expiredParticipants.length > 0) {
      // 1. Delete availabilities for all participants of expired events.
      await db.delete(availabilities).where(
        inArray(
          availabilities.participantId,
          expiredParticipants.map((p) => p.id)
        )
      );
      // 2. Delete the participants themselves.
      await db.delete(participants).where(inArray(participants.eventId, expiredIds));
    }

    // 3. Finally delete the events.
    await db.delete(events).where(inArray(events.id, expiredIds));
    return expiredIds.length;
  }

  /**
   * addOrUpdateParticipant — Upsert a participant's availability for an event.
   *
   * "Upsert" means INSERT if the record doesn't exist, UPDATE if it does.
   * We use an explicit check-then-act pattern (SELECT → INSERT or DELETE+INSERT)
   * for clarity and to handle the availability replacement logic separately.
   *
   * Strategy for the availability update:
   *   - We don't do a delta update (add new dates, remove removed dates).
   *   - Instead, we DELETE all existing availability rows for the participant
   *     and INSERT the new set from scratch. This is simpler and avoids
   *     complex diff logic — the client always sends the complete desired state.
   *
   * The `participant!.id` non-null assertion after the INSERT tells TypeScript
   * we know the value is defined — this is safe because `.returning()` always
   * returns the inserted row, but TypeScript can't infer that without the assertion.
   *
   * Returns the participant record with the newly saved availabilities attached,
   * which the route handler sends back to the client to confirm the save.
   */
  async addOrUpdateParticipant(
    slug: string,
    req: CreateParticipantRequest
  ): Promise<ParticipantWithAvailabilities> {
    const [event] = await db.select().from(events).where(eq(events.slug, slug));
    if (!event) throw new Error('Event not found');

    // Check if participant exists (matched by exact name within this event)
    let [participant] = await db
      .select()
      .from(participants)
      .where(and(eq(participants.eventId, event.id), eq(participants.name, req.name)));

    if (!participant) {
      // New participant — insert a fresh row.
      [participant] = await db
        .insert(participants)
        .values({
          eventId: event.id,
          name: req.name,
        })
        .returning();
    } else {
      // Existing participant — wipe their previous availability before
      // inserting the new set. This "replace all" approach avoids needing to
      // diff the old and new sets.
      await db.delete(availabilities).where(eq(availabilities.participantId, participant.id));
    }

    // Insert new availabilities (skip if the participant submitted no dates).
    if (req.availabilities.length > 0) {
      await db.insert(availabilities).values(
        req.availabilities.map((a) => ({
          eventId: event.id,
          participantId: participant!.id,
          date: a.date,
          type: a.type,
        }))
      );
    }

    // Return the participant with their new availabilities attached.
    // We use `req.availabilities` directly (rather than re-querying) because
    // we know they were just inserted successfully.
    return { ...participant, availabilities: req.availabilities };
  }
}

/**
 * storage — The singleton instance used by the entire server.
 *
 * Exporting a single pre-constructed instance (rather than the class itself)
 * follows the module singleton pattern. Any file that does `import { storage }
 * from './storage'` gets the same instance, which means all requests share the
 * same database connection — as intended.
 */
export const storage = new DatabaseStorage();
