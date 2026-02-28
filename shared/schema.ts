import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  startDate: text("start_date").notNull().$defaultFn(() => new Date().toISOString().split('T')[0]),
  endDate: text("end_date").notNull().$defaultFn(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
  }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const participants = sqliteTable("participants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  name: text("name").notNull(),
});

export const availabilities = sqliteTable("availabilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  participantId: integer("participant_id").notNull(),
  date: text("date").notNull(), // Format: YYYY-MM-DD
  type: text("type").notNull().default('all_day'), // 'all_day', 'morning', 'afternoon'
});

export const insertEventSchema = createInsertSchema(events).pick({
  title: true,
  description: true,
  startDate: true,
  endDate: true,
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Availability = typeof availabilities.$inferSelect;
export type AvailabilityType = 'all_day' | 'morning' | 'afternoon';

export type ParticipantWithAvailabilities = Participant & {
  availabilities: { date: string, type: AvailabilityType }[];
};

export type EventResponse = Event & {
  participants: ParticipantWithAvailabilities[];
};

export type CreateParticipantRequest = {
  name: string;
  availabilities: { date: string, type: AvailabilityType }[];
};
