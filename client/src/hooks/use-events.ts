/**
 * hooks/use-events.ts — Data Fetching and Mutation Hooks for Events
 *
 * This file contains all the React Query hooks that interact with the server's
 * event and participant APIs. Grouping them here means components stay clean —
 * they declare *what* data they need without caring *how* it's fetched, cached,
 * or kept fresh.
 *
 * Hooks vs plain functions:
 *   These are all "custom hooks" — functions whose names start with `use`. They
 *   call other hooks internally (`useMutation`, `useQuery`, `useToast`), which
 *   is why they must follow the Rules of Hooks: only called at the top level of
 *   a component or another hook, never conditionally.
 *
 * Mutations vs Queries:
 *   - `useQuery` is for *reading* data. It runs automatically when the component
 *     mounts (or when its `queryKey` changes) and caches the result.
 *   - `useMutation` is for *writing* data (POST, PATCH, DELETE). It does nothing
 *     until you call `.mutate(data)` explicitly, e.g. on a button click.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type {
  InsertEvent,
  EventResponse,
  ParticipantWithAvailabilities,
  CreateParticipantRequest,
} from '@shared/schema';
import { api, buildUrl } from '@shared/routes';

/**
 * useCreateEvent — Mutation hook for creating a new event.
 *
 * Returns a mutation object. Call `createEvent.mutate(data)` to fire the POST
 * request. The hook handles the error toast automatically so the caller doesn't
 * need to.
 *
 * The `onSuccess` callback is intentionally not defined here — it's passed as
 * the second argument to `.mutate()` at the call site in Home.tsx, because the
 * navigation to the new event page is a concern of the UI, not the data layer.
 *
 * Why parse the error as JSON?
 *   The server sends error details in JSON format (`{ message: "..." }`). Unlike
 *   the generic `throwIfResNotOk` in queryClient.ts which reads the raw text,
 *   this code parses JSON so it can extract the structured error message.
 */
export function useCreateEvent() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertEvent) => {
      const res = await fetch(api.events.create.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create event');
      }

      return res.json();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * useEvent — Query hook for fetching a single event by its URL slug.
 *
 * Returns `{ data, isLoading, error }` from React Query. The event data
 * includes the full participant list and their availabilities, so this one
 * query powers both the heatmap and the editing UI on the Event page.
 *
 * `queryKey: [api.events.get.path, slug]`
 *   The cache key is an array that uniquely identifies this request. If another
 *   component calls `useEvent('my-trip')`, it gets the same cached data.
 *   When a mutation calls `queryClient.invalidateQueries({ queryKey: [...] })`,
 *   it matches on this key and triggers a background re-fetch.
 *
 * `enabled: !!slug`
 *   The `!!` converts `slug` to a boolean. This prevents the query from firing
 *   if `slug` is an empty string (e.g. while the route parameters are being
 *   parsed on first render). `!!''` is `false`, so the query is disabled until
 *   a real slug is available.
 *
 * 404 handling:
 *   A 404 is returned as `null` (with a type assertion `as any` to satisfy
 *   TypeScript). This allows the UI to differentiate between "still loading"
 *   and "event genuinely doesn't exist" without treating a missing event as an
 *   error worthy of a toast notification.
 */
export function useEvent(slug: string) {
  return useQuery<EventResponse>({
    queryKey: [api.events.get.path, slug],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.events.get.path, { slug }));
      if (res.status === 404) return null as any; // Allow null for proper 404 handling in UI
      if (!res.ok) throw new Error('Failed to fetch event');
      return res.json();
    },
    enabled: !!slug,
  });
}

/**
 * useUpdateEvent — Mutation hook for updating an event's date range.
 *
 * Used by the organiser controls in the Event page header. When the organiser
 * changes the start or end date, this mutation PATCHes just those fields.
 *
 * Cache invalidation (`queryClient.invalidateQueries`):
 *   After a successful update, we tell React Query that the cached event data
 *   is now stale. React Query responds by re-fetching the event in the background
 *   and updating all components that depend on it. This is the "reactivity loop":
 *   mutate → invalidate → refetch → UI updates.
 *
 * `useQueryClient()`:
 *   This hook gives us access to the shared `queryClient` instance from anywhere
 *   in the component tree, without it needing to be passed as a prop.
 */
export function useUpdateEvent(slug: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { startDate?: string; endDate?: string }) => {
      const res = await fetch(buildUrl(api.events.update.path, { slug }), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update event');
      }
      return res.json();
    },
    onSuccess: () => {
      // Mark the event query stale so the UI re-fetches updated date info.
      queryClient.invalidateQueries({ queryKey: [api.events.get.path, slug] });
    },
    onError: (error) => {
      toast({ title: 'Error updating dates', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * useUpdateAvailability — Mutation hook for saving a participant's availability.
 *
 * This is a "create or update" (upsert) operation: if a participant with the
 * given name already exists for this event, their availability is replaced;
 * otherwise a new participant record is created. The server handles the upsert
 * logic — the client just POSTs a name + availability array.
 *
 * Why invalidate the event query on success?
 *   The event query caches the full participant list including everyone's
 *   availabilities. After saving, the cached data is stale because it doesn't
 *   yet include the current user's new selections. Invalidating forces a
 *   re-fetch, which then updates the group heatmap and participant list to
 *   reflect the changes.
 *
 * Return type annotation `as Promise<ParticipantWithAvailabilities>`:
 *   TypeScript can't infer the type of `res.json()` (it's `any`). This cast
 *   tells TypeScript the shape of the resolved value so callers get type-safe
 *   access to the response data.
 */
export function useUpdateAvailability(slug: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateParticipantRequest) => {
      const res = await fetch(buildUrl(api.participants.createOrUpdate.path, { slug }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update availability');
      }

      return res.json() as Promise<ParticipantWithAvailabilities>;
    },
    onSuccess: () => {
      // Invalidate the event query to refresh the heatmap and participant list
      queryClient.invalidateQueries({ queryKey: [api.events.get.path, slug] });
      toast({
        title: 'Availability Saved',
        description: 'Your available dates have been updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error saving availability',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
