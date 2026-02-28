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

export class DatabaseStorage implements IStorage {
  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const slug = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const [event] = await db
      .insert(events)
      .values({ ...insertEvent, slug })
      .returning();
    return event;
  }

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

    const participantsWithDates = eventParticipants.map((p) => ({
      ...p,
      availabilities: eventAvailabilities
        .filter((a) => a.participantId === p.id)
        .map((a) => ({ date: a.date, type: a.type as AvailabilityType })),
    }));

    return { ...event, participants: participantsWithDates };
  }

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

  async cleanupExpiredEvents(graceDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - graceDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const expired = await db
      .select({ id: events.id })
      .from(events)
      .where(lt(events.endDate, cutoffStr));

    if (expired.length === 0) return 0;

    const expiredIds = expired.map((e) => e.id);
    const expiredParticipants = await db
      .select({ id: participants.id })
      .from(participants)
      .where(inArray(participants.eventId, expiredIds));

    if (expiredParticipants.length > 0) {
      await db.delete(availabilities).where(
        inArray(
          availabilities.participantId,
          expiredParticipants.map((p) => p.id)
        )
      );
      await db.delete(participants).where(inArray(participants.eventId, expiredIds));
    }

    await db.delete(events).where(inArray(events.id, expiredIds));
    return expiredIds.length;
  }

  async addOrUpdateParticipant(
    slug: string,
    req: CreateParticipantRequest
  ): Promise<ParticipantWithAvailabilities> {
    const [event] = await db.select().from(events).where(eq(events.slug, slug));
    if (!event) throw new Error('Event not found');

    // Check if participant exists
    let [participant] = await db
      .select()
      .from(participants)
      .where(and(eq(participants.eventId, event.id), eq(participants.name, req.name)));

    if (!participant) {
      [participant] = await db
        .insert(participants)
        .values({
          eventId: event.id,
          name: req.name,
        })
        .returning();
    } else {
      // Clear existing availabilities
      await db.delete(availabilities).where(eq(availabilities.participantId, participant.id));
    }

    // Insert new availabilities
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

    return { ...participant, availabilities: req.availabilities };
  }
}

export const storage = new DatabaseStorage();
