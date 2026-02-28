import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { InsertEvent, EventResponse, ParticipantWithAvailabilities, CreateParticipantRequest } from "@shared/schema";
import { api, buildUrl } from "@shared/routes";

export function useCreateEvent() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertEvent) => {
      const res = await fetch(api.events.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create event");
      }
      
      return res.json();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useEvent(slug: string) {
  return useQuery<EventResponse>({
    queryKey: [api.events.get.path, slug],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.events.get.path, { slug }));
      if (res.status === 404) return null as any; // Allow null for proper 404 handling in UI
      if (!res.ok) throw new Error("Failed to fetch event");
      return res.json();
    },
    enabled: !!slug,
  });
}

export function useUpdateAvailability(slug: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateParticipantRequest) => {
      const res = await fetch(buildUrl(api.participants.createOrUpdate.path, { slug }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update availability");
      }
      
      return res.json() as Promise<ParticipantWithAvailabilities>;
    },
    onSuccess: () => {
      // Invalidate the event query to refresh the heatmap and participant list
      queryClient.invalidateQueries({ queryKey: [api.events.get.path, slug] });
      toast({
        title: "Availability Saved",
        description: "Your available dates have been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving availability",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
