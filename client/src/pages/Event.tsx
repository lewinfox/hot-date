import { useState, useMemo, useEffect, useRef } from 'react';
import { useRoute, useSearch, Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Check, Users, Calendar as CalendarIcon, UserCheck } from 'lucide-react';
import hotDateLogo from '@assets/logo.png';
import { format } from 'date-fns';
import { useEvent, useUpdateAvailability, useUpdateEvent } from '@/hooks/use-events';
import { Calendar, PARTICIPANT_COLORS, type ParticipantDateInfo } from '@/components/Calendar';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { useToast } from '@/hooks/use-toast';
import type { AvailabilityType } from '@shared/schema';

export default function EventPage() {
  const [, params] = useRoute('/event/:slug');
  const slug = params?.slug || '';
  const searchString = useSearch();
  const queryParams = new URLSearchParams(searchString);
  const nameFromUrl = queryParams.get('name');
  
  const { data: event, isLoading, error } = useEvent(slug);
  const updateAvailability = useUpdateAvailability(slug);
  const updateEvent = useUpdateEvent(slug);
  const { toast } = useToast();

  const [localStartDate, setLocalStartDate] = useState('');
  const [localEndDate, setLocalEndDate] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const hasAppliedUrlName = useRef(false);

  const [name, setName] = useState('');
  const [selectedAvailabilities, setSelectedAvailabilities] = useState<Map<string, AvailabilityType>>(new Map());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (nameFromUrl && !hasAppliedUrlName.current) {
      hasAppliedUrlName.current = true;
      setName(nameFromUrl);
    }
  }, [nameFromUrl]);

  useEffect(() => {
    if (event) {
      setLocalStartDate(event.startDate ?? '');
      setLocalEndDate(event.endDate ?? '');
    }
  }, [event?.startDate, event?.endDate]);

  useEffect(() => {
    if (event?.participants && name.trim()) {
      const existingUser = event.participants.find(
        (p) => p.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (existingUser) {
        const newMap = new Map<string, AvailabilityType>();
        existingUser.availabilities.forEach(a => newMap.set(a.date, a.type as AvailabilityType));
        setSelectedAvailabilities(newMap);
      } else {
        setSelectedAvailabilities(new Map());
      }
    }
  }, [name, event?.participants]);

  const heatmapData = useMemo(() => {
    if (!event?.participants) return { map: {}, total: 0, optimalDates: [], participantDateMap: {} };
    
    const map: Record<string, Record<AvailabilityType, number>> = {};
    const participantDateMap: Record<string, ParticipantDateInfo[]> = {};
    const uniqueParticipantsPerDate: Record<string, Set<number>> = {};

    event.participants.forEach((p, participantIndex) => {
      p.availabilities.forEach(a => {
        if (!map[a.date]) {
          map[a.date] = { all_day: 0, morning: 0, afternoon: 0 };
        }
        map[a.date][a.type as AvailabilityType]++;

        if (!uniqueParticipantsPerDate[a.date]) {
          uniqueParticipantsPerDate[a.date] = new Set();
        }

        if (!uniqueParticipantsPerDate[a.date].has(participantIndex)) {
          uniqueParticipantsPerDate[a.date].add(participantIndex);
          if (!participantDateMap[a.date]) {
            participantDateMap[a.date] = [];
          }
          participantDateMap[a.date].push({
            participantIndex,
            type: a.type as AvailabilityType,
          });
        }
      });
    });

    const optimalDates = Object.entries(uniqueParticipantsPerDate)
      .filter(([_, participants]) => participants.size === event.participants.length && event.participants.length > 0)
      .map(([date]) => date)
      .sort();

    return { 
      map, 
      total: event.participants.length,
      optimalDates,
      participantDateMap,
    };
  }, [event?.participants]);

  const handleToggleDate = (dateStr: string) => {
    const newAvailabilities = new Map(selectedAvailabilities);
    const currentType = newAvailabilities.get(dateStr);
    
    if (!currentType) {
      newAvailabilities.set(dateStr, 'all_day');
    } else if (currentType === 'all_day') {
      newAvailabilities.set(dateStr, 'morning');
    } else if (currentType === 'morning') {
      newAvailabilities.set(dateStr, 'afternoon');
    } else {
      newAvailabilities.delete(dateStr);
    }
    setSelectedAvailabilities(newAvailabilities);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: "Name required", description: "Please enter your name to save availability.", variant: "destructive" });
      return;
    }
    
    const availabilitiesArray = Array.from(selectedAvailabilities.entries()).map(([date, type]) => ({
      date,
      type
    }));

    updateAvailability.mutate({
      name: name.trim(),
      availabilities: availabilitiesArray
    });
  };

  const selectParticipant = (participantName: string) => {
    setName(participantName);
    nameInputRef.current?.focus();
    nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast({ title: `Editing as ${participantName}`, description: "Update your selections and click Save." });
  };

  const getParticipantEditUrl = (participantName: string) => {
    const baseUrl = `${window.location.origin}/event/${slug}`;
    return `${baseUrl}?name=${encodeURIComponent(participantName)}`;
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/event/${slug}`);
    setCopied(true);
    toast({ title: "Link copied!", description: "Share this link with your group." });
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-secondary rounded-full" />
          <div className="w-48 h-6 bg-secondary rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-bold">Event not found</h1>
          <p className="text-muted-foreground">The event you're looking for doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <img src={hotDateLogo} alt="Hot Date" className="w-16 h-auto shrink-0" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{event.title}</h1>
              {event.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{event.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  type="date"
                  value={localStartDate}
                  onChange={(e) => setLocalStartDate(e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value && e.target.value !== event.startDate) {
                      updateEvent.mutate({ startDate: e.target.value });
                    }
                  }}
                  className="text-sm bg-transparent border-b border-border/50 hover:border-primary focus:border-primary focus:outline-none text-foreground cursor-pointer transition-colors"
                />
                <span className="text-muted-foreground text-sm">→</span>
                <input
                  type="date"
                  value={localEndDate}
                  onChange={(e) => setLocalEndDate(e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value && e.target.value !== event.endDate) {
                      updateEvent.mutate({ endDate: e.target.value });
                    }
                  }}
                  className="text-sm bg-transparent border-b border-border/50 hover:border-primary focus:border-primary focus:outline-none text-foreground cursor-pointer transition-colors"
                />
              </div>
            </div>
          </div>
          
          <Button variant="secondary" size="sm" onClick={copyLink} className="self-start sm:self-auto shrink-0" data-testid="button-copy-link">
            {copied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Link2 className="w-4 h-4 mr-2" />}
            {copied ? "Copied" : "Copy Link"}
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {heatmapData.optimalDates.length > 0 && heatmapData.total > 1 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 p-6 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl flex items-start gap-4"
          >
            <div className="p-3 bg-yellow-500/20 rounded-full shrink-0" style={{ color: '#d4a017' }}>
              <CalendarIcon size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-lg">Perfect Match!</h3>
              <p className="text-muted-foreground mt-1">
                Everyone is available on {heatmapData.optimalDates.length === 1 ? 'this day' : 'these days'}:
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {heatmapData.optimalDates.map(dateStr => (
                  <span key={dateStr} className="px-3 py-1 font-medium rounded-lg text-sm shadow-sm text-white" style={{ backgroundColor: '#d4a017' }}>
                    {format(new Date(dateStr), 'EEEE, MMM d')}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24">
          
          <section className="flex flex-col gap-8">
            <div className="space-y-4 border-b border-border pb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <UserCheck className="w-6 h-6 text-primary" />
                Your Availability
              </h2>
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-primary mb-1">How to mark your time:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Click 1x: <span className="font-medium text-foreground">All Day</span> (Solid color)</li>
                  <li>Click 2x: <span className="font-medium text-foreground">Morning only</span> (Left side)</li>
                  <li>Click 3x: <span className="font-medium text-foreground">Afternoon/Evening only</span> (Right side)</li>
                  <li>Click 4x: <span className="font-medium text-foreground">Unavailable</span> (Clear)</li>
                </ul>
              </div>
            </div>

            <div className="sticky top-24 z-10 pt-2 pb-4">
              <div className="flex flex-col gap-3 bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 neon-card">
                <h2 className="text-2xl font-bold neon-label">Your Name</h2>
                <div className="flex items-center gap-4">
                <Input
                  ref={nameInputRef}
                  placeholder="e.g. Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-name"
                />
                <Button 
                  onClick={handleSave} 
                  disabled={!name.trim() || updateAvailability.isPending}
                  isLoading={updateAvailability.isPending}
                  className="shrink-0"
                  data-testid="button-save"
                >
                  Save
                </Button>
                </div>
              </div>
            </div>

            <div className="bg-card p-4 sm:p-8 rounded-[2rem] shadow-soft border border-border/50">
              <Calendar 
                startDate={event.startDate ? new Date(event.startDate) : undefined}
                endDate={event.endDate ? new Date(event.endDate) : undefined}
                selectedAvailabilities={selectedAvailabilities} 
                onToggleDate={handleToggleDate} 
              />
              <div className="mt-6 flex flex-wrap gap-4 text-xs font-medium text-muted-foreground justify-center border-t border-border pt-6">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-sm bg-primary" />
                  <span>All Day</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-sm bg-secondary overflow-hidden flex">
                    <div className="w-1/2 h-full bg-primary" />
                  </div>
                  <span>Morning</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-sm bg-secondary overflow-hidden flex">
                    <div className="w-1/2 h-full" />
                    <div className="w-1/2 h-full bg-primary" />
                  </div>
                  <span>Afternoon</span>
                </div>
              </div>
              <p className="text-center text-[10px] text-muted-foreground mt-2 uppercase tracking-wider font-bold opacity-50">Click multiple times to cycle through options</p>
            </div>
          </section>

          <section className="flex flex-col gap-8">
            <div className="space-y-2 border-b border-border pb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Users className="w-6 h-6 text-accent" />
                Group Availability
              </h2>
              <p className="text-muted-foreground">See when the rest of the group is free.</p>
            </div>

            <div className="bg-secondary/30 p-4 sm:p-8 rounded-[2rem] border border-border/50">
              {heatmapData.total === 0 ? (
                <div className="text-center py-12 opacity-50">
                  <CalendarIcon className="w-12 h-12 mx-auto mb-4" />
                  <p>No one has responded yet.<br/>Be the first!</p>
                </div>
              ) : (
                <>
                  <Calendar
                    readonly
                    startDate={event.startDate ? new Date(event.startDate) : undefined}
                    endDate={event.endDate ? new Date(event.endDate) : undefined}
                    availabilityMap={heatmapData.map}
                    totalParticipants={heatmapData.total}
                    participantDateMap={heatmapData.participantDateMap}
                    participantColors={PARTICIPANT_COLORS}
                    participantNames={event.participants.map(p => p.name)}
                  />
                  <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium text-muted-foreground justify-center border-t border-border pt-6">
                    {event.participants.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length] }} />
                        <span>{p.name}</span>
                      </div>
                    ))}
                    {heatmapData.total > 1 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: '#d4a017' }} />
                        <span className="font-semibold">Everyone</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {event.participants.length > 0 && (
              <div className="mt-4" data-testid="participant-list">
                <h3 className="font-semibold text-lg mb-3">Participants ({event.participants.length})</h3>
                <p className="text-xs text-muted-foreground mb-4">Click a name to edit their availability, or copy their personal edit link.</p>
                <div className="flex flex-col gap-2">
                  <AnimatePresence>
                    {event.participants.map((p, i) => {
                      const isSelected = name.trim().toLowerCase() === p.name.toLowerCase();
                      return (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className={`flex items-center justify-between px-4 py-3 bg-card border rounded-xl text-sm font-medium shadow-sm transition-all duration-200 ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}
                          data-testid={`participant-${p.id}`}
                        >
                          <button
                            type="button"
                            onClick={() => selectParticipant(p.name)}
                            className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                            aria-label={`Edit availability for ${p.name}`}
                            data-testid={`edit-participant-${p.id}`}
                          >
                            <div
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length] }}
                            />
                            <span className="truncate">{p.name}</span>
                            <span className="text-muted-foreground text-xs bg-secondary px-1.5 rounded-md shrink-0">
                              {p.availabilities.length} days
                            </span>
                            {isSelected && (
                              <span className="text-xs text-primary font-semibold shrink-0">Editing</span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(getParticipantEditUrl(p.name));
                              toast({ title: "Edit link copied!", description: `Personal edit link for ${p.name} copied to clipboard.` });
                            }}
                            className="p-1.5 rounded-lg hover:bg-secondary transition-colors shrink-0 ml-2"
                            title={`Copy edit link for ${p.name}`}
                            aria-label={`Copy edit link for ${p.name}`}
                            data-testid={`copy-link-${p.id}`}
                          >
                            <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </section>

        </div>

        <div className="mt-24 max-w-2xl mx-auto border-t border-border/50 pt-8 pb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-secondary/50 rounded-lg shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
              </div>
              <div className="text-[11px] leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground mb-1 uppercase tracking-wider">Privacy & Purpose</p>
                <p>We collect only the names and availability you provide to help your group find the best time. No accounts, no tracking, and no third-party data sharing.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-secondary/50 rounded-lg shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div className="text-[11px] leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground mb-1 uppercase tracking-wider">Secure Access</p>
                <p>Access to this event is limited to those with the unique link. Ensure you keep your event URL private to maintain group confidentiality.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
