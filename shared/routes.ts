import { z } from "zod";
import { insertEventSchema, events } from "./schema";

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

export const api = {
  events: {
    create: {
      method: 'POST' as const,
      path: '/api/events' as const,
      input: insertEventSchema,
      responses: {
        201: z.custom<typeof events.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/events/:slug' as const,
      responses: {
        200: z.any(), // EventResponse
        404: errorSchemas.notFound,
      },
    },
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
    createOrUpdate: {
      method: 'POST' as const,
      path: '/api/events/:slug/participants' as const,
      input: z.object({
        name: z.string().min(1, "Name is required"),
        availabilities: z.array(z.object({
          date: z.string(),
          type: z.enum(['all_day', 'morning', 'afternoon'])
        })),
      }),
      responses: {
        200: z.any(), // ParticipantWithAvailabilities
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  }
};

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
