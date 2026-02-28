import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock server/db with an in-memory SQLite database before importing storage
vi.mock('../../server/db', async () => {
  const DatabaseMod = await import('better-sqlite3');
  const Database = DatabaseMod.default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const schema = await import('../../shared/schema');
  const path = await import('path');

  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve('./migrations') });

  return { db };
});

import { db } from '../../server/db';
import { events, participants, availabilities } from '../../shared/schema';
import { DatabaseStorage } from '../../server/storage';

const storage = new DatabaseStorage();

beforeEach(async () => {
  // Clear all tables in dependency order
  await db.delete(availabilities);
  await db.delete(participants);
  await db.delete(events);
});

describe('DatabaseStorage.createEvent', () => {
  it('creates an event and returns it with a generated slug', async () => {
    const event = await storage.createEvent({
      title: 'Summer Party',
      startDate: '2025-07-01',
      endDate: '2025-07-31',
    });

    expect(event.id).toBeDefined();
    expect(event.title).toBe('Summer Party');
    expect(event.slug).toMatch(/^[a-f0-9]{10}$/);
    expect(event.startDate).toBe('2025-07-01');
    expect(event.endDate).toBe('2025-07-31');
  });

  it('assigns unique slugs to different events', async () => {
    const a = await storage.createEvent({
      title: 'Event A',
      startDate: '2025-07-01',
      endDate: '2025-07-31',
    });
    const b = await storage.createEvent({
      title: 'Event B',
      startDate: '2025-08-01',
      endDate: '2025-08-31',
    });

    expect(a.slug).not.toBe(b.slug);
  });

  it('stores an optional description', async () => {
    const event = await storage.createEvent({
      title: 'With Desc',
      description: 'A detailed description',
      startDate: '2025-07-01',
      endDate: '2025-07-31',
    });

    expect(event.description).toBe('A detailed description');
  });
});

describe('DatabaseStorage.getEventBySlug', () => {
  it('returns undefined for a non-existent slug', async () => {
    const result = await storage.getEventBySlug('doesnotexist');
    expect(result).toBeUndefined();
  });

  it('returns the event with an empty participants array when no one has joined', async () => {
    const created = await storage.createEvent({
      title: 'Solo Event',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });
    const fetched = await storage.getEventBySlug(created.slug);

    expect(fetched).toBeDefined();
    expect(fetched!.title).toBe('Solo Event');
    expect(fetched!.participants).toEqual([]);
  });

  it('returns the event with participants and their availabilities', async () => {
    const event = await storage.createEvent({
      title: 'Group Event',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    await storage.addOrUpdateParticipant(event.slug, {
      name: 'Alice',
      availabilities: [{ date: '2025-06-10', type: 'all_day' }],
    });

    const fetched = await storage.getEventBySlug(event.slug);

    expect(fetched!.participants).toHaveLength(1);
    expect(fetched!.participants[0].name).toBe('Alice');
    expect(fetched!.participants[0].availabilities).toEqual([
      { date: '2025-06-10', type: 'all_day' },
    ]);
  });
});

describe('DatabaseStorage.addOrUpdateParticipant', () => {
  it('throws when the event slug does not exist', async () => {
    await expect(
      storage.addOrUpdateParticipant('noevent', { name: 'Bob', availabilities: [] })
    ).rejects.toThrow('Event not found');
  });

  it('creates a new participant with availabilities', async () => {
    const event = await storage.createEvent({
      title: 'Meeting',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    const participant = await storage.addOrUpdateParticipant(event.slug, {
      name: 'Charlie',
      availabilities: [
        { date: '2025-06-05', type: 'morning' },
        { date: '2025-06-06', type: 'afternoon' },
      ],
    });

    expect(participant.name).toBe('Charlie');
    expect(participant.availabilities).toHaveLength(2);
    expect(participant.availabilities).toContainEqual({ date: '2025-06-05', type: 'morning' });
    expect(participant.availabilities).toContainEqual({ date: '2025-06-06', type: 'afternoon' });
  });

  it('replaces availabilities when the same participant name is resubmitted', async () => {
    const event = await storage.createEvent({
      title: 'Standup',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    await storage.addOrUpdateParticipant(event.slug, {
      name: 'Dana',
      availabilities: [{ date: '2025-06-01', type: 'all_day' }],
    });

    const updated = await storage.addOrUpdateParticipant(event.slug, {
      name: 'Dana',
      availabilities: [{ date: '2025-06-15', type: 'morning' }],
    });

    expect(updated.availabilities).toHaveLength(1);
    expect(updated.availabilities[0]).toEqual({ date: '2025-06-15', type: 'morning' });

    // Confirm old availability is gone via a fresh fetch
    const fetched = await storage.getEventBySlug(event.slug);
    const dana = fetched!.participants.find((p: { name: string }) => p.name === 'Dana')!;
    expect(dana.availabilities).toHaveLength(1);
    expect(dana.availabilities[0].date).toBe('2025-06-15');
  });

  it('handles a participant with no availabilities', async () => {
    const event = await storage.createEvent({
      title: 'Empty',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    const participant = await storage.addOrUpdateParticipant(event.slug, {
      name: 'Eve',
      availabilities: [],
    });

    expect(participant.availabilities).toHaveLength(0);
  });

  it('supports multiple distinct participants on the same event', async () => {
    const event = await storage.createEvent({
      title: 'Shared',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    await storage.addOrUpdateParticipant(event.slug, {
      name: 'Frank',
      availabilities: [{ date: '2025-06-10', type: 'all_day' }],
    });
    await storage.addOrUpdateParticipant(event.slug, {
      name: 'Grace',
      availabilities: [{ date: '2025-06-11', type: 'morning' }],
    });

    const fetched = await storage.getEventBySlug(event.slug);
    expect(fetched!.participants).toHaveLength(2);
  });
});

describe('DatabaseStorage.updateEventDates', () => {
  it('returns undefined for a non-existent slug', async () => {
    const result = await storage.updateEventDates('noevent', '2025-09-01', '2025-09-30');
    expect(result).toBeUndefined();
  });

  it('updates startDate only', async () => {
    const event = await storage.createEvent({
      title: 'Date Test',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    const updated = await storage.updateEventDates(event.slug, '2025-07-01', undefined);

    expect(updated!.startDate).toBe('2025-07-01');
    expect(updated!.endDate).toBe('2025-06-30');
  });

  it('updates endDate only', async () => {
    const event = await storage.createEvent({
      title: 'Date Test',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    const updated = await storage.updateEventDates(event.slug, undefined, '2025-08-31');

    expect(updated!.startDate).toBe('2025-06-01');
    expect(updated!.endDate).toBe('2025-08-31');
  });

  it('updates both startDate and endDate', async () => {
    const event = await storage.createEvent({
      title: 'Date Test',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    const updated = await storage.updateEventDates(event.slug, '2025-09-01', '2025-09-30');

    expect(updated!.startDate).toBe('2025-09-01');
    expect(updated!.endDate).toBe('2025-09-30');
  });

  it('persists the change so getEventBySlug reflects the new dates', async () => {
    const event = await storage.createEvent({
      title: 'Persist Test',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    await storage.updateEventDates(event.slug, '2025-10-01', '2025-10-31');

    const fetched = await storage.getEventBySlug(event.slug);
    expect(fetched!.startDate).toBe('2025-10-01');
    expect(fetched!.endDate).toBe('2025-10-31');
  });

  it('does not affect other event fields', async () => {
    const event = await storage.createEvent({
      title: 'Unchanged Fields',
      description: 'Keep me',
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    const updated = await storage.updateEventDates(event.slug, '2025-07-01', '2025-07-31');

    expect(updated!.title).toBe('Unchanged Fields');
    expect(updated!.description).toBe('Keep me');
    expect(updated!.slug).toBe(event.slug);
  });
});

describe('DatabaseStorage.cleanupExpiredEvents', () => {
  // Helper: date string N days relative to today
  const relativeDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  it('returns 0 when there are no events', async () => {
    expect(await storage.cleanupExpiredEvents(30)).toBe(0);
  });

  it('returns 0 when no events are past the grace period', async () => {
    await storage.createEvent({
      title: 'Future',
      startDate: relativeDate(-10),
      endDate: relativeDate(30),
    });
    await storage.createEvent({
      title: 'Ending Soon',
      startDate: relativeDate(-5),
      endDate: relativeDate(1),
    });

    expect(await storage.cleanupExpiredEvents(30)).toBe(0);
  });

  it('deletes an expired event and returns the count', async () => {
    await storage.createEvent({
      title: 'Old Event',
      startDate: '2020-01-01',
      endDate: '2020-06-01',
    });

    expect(await storage.cleanupExpiredEvents(30)).toBe(1);
  });

  it('does not delete an event that ended exactly graceDays ago', async () => {
    await storage.createEvent({
      title: 'Boundary',
      startDate: relativeDate(-40),
      endDate: relativeDate(-30),
    });

    expect(await storage.cleanupExpiredEvents(30)).toBe(0);
  });

  it('deletes an event that ended one day past the grace period', async () => {
    await storage.createEvent({
      title: 'Just Expired',
      startDate: relativeDate(-40),
      endDate: relativeDate(-31),
    });

    expect(await storage.cleanupExpiredEvents(30)).toBe(1);
  });

  it('cascades to delete participants and availabilities', async () => {
    const event = await storage.createEvent({
      title: 'Old With Data',
      startDate: '2020-01-01',
      endDate: '2020-06-01',
    });
    await storage.addOrUpdateParticipant(event.slug, {
      name: 'Alice',
      availabilities: [{ date: '2020-03-01', type: 'all_day' }],
    });

    await storage.cleanupExpiredEvents(30);

    // Event should be gone
    expect(await storage.getEventBySlug(event.slug)).toBeUndefined();

    // Participants and availabilities should also be gone
    const { db } = await import('../../server/db');
    const { participants, availabilities } = await import('../../shared/schema');
    const { eq } = await import('drizzle-orm');
    const remainingParticipants = await db
      .select()
      .from(participants)
      .where(eq(participants.eventId, event.id));
    const remainingAvailabilities = await db
      .select()
      .from(availabilities)
      .where(eq(availabilities.eventId, event.id));
    expect(remainingParticipants).toHaveLength(0);
    expect(remainingAvailabilities).toHaveLength(0);
  });

  it('only deletes expired events, leaving current ones intact', async () => {
    await storage.createEvent({ title: 'Old', startDate: '2020-01-01', endDate: '2020-06-01' });
    const current = await storage.createEvent({
      title: 'Current',
      startDate: relativeDate(-5),
      endDate: relativeDate(30),
    });

    const deleted = await storage.cleanupExpiredEvents(30);

    expect(deleted).toBe(1);
    expect(await storage.getEventBySlug(current.slug)).toBeDefined();
  });

  it('deletes multiple expired events in one pass', async () => {
    await storage.createEvent({ title: 'Old 1', startDate: '2020-01-01', endDate: '2020-03-01' });
    await storage.createEvent({ title: 'Old 2', startDate: '2021-01-01', endDate: '2021-06-01' });
    await storage.createEvent({ title: 'Old 3', startDate: '2022-01-01', endDate: '2022-12-31' });

    expect(await storage.cleanupExpiredEvents(30)).toBe(3);
  });
});
