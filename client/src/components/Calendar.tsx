import { useMemo, useState } from 'react';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  addMonths,
  isToday,
  isBefore,
  isAfter,
  startOfToday,
  getDay,
  differenceInMonths,
  startOfDay,
} from 'date-fns';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AvailabilityType } from '@shared/schema';

export interface ParticipantDateInfo {
  participantIndex: number;
  type: AvailabilityType;
}

interface CalendarProps {
  startDate?: Date;
  endDate?: Date;
  selectedAvailabilities?: Map<string, AvailabilityType>;
  onToggleDate?: (dateStr: string) => void;
  readonly?: boolean;
  availabilityMap?: Record<string, Record<AvailabilityType, number>>;
  totalParticipants?: number;
  participantDateMap?: Record<string, ParticipantDateInfo[]>;
  participantColors?: string[];
  participantNames?: string[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PARTICIPANT_COLORS = [
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#8b5cf6',
  '#06b6d4',
  '#ef4444',
  '#22c55e',
  '#eab308',
  '#3b82f6',
  '#d946ef',
  '#64748b',
];

const FULL_OVERLAP_COLOR = '#22c55e';

export { PARTICIPANT_COLORS };

export function Calendar({
  startDate = new Date(),
  endDate,
  selectedAvailabilities = new Map(),
  onToggleDate,
  readonly = false,
  availabilityMap = {},
  totalParticipants = 0,
  participantDateMap = {},
  participantColors = PARTICIPANT_COLORS,
  participantNames = [],
}: CalendarProps) {
  const today = startOfToday();
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<DOMRect | null>(null);

  const tooltipParticipants = useMemo(() => {
    if (!hoveredDate || !participantNames.length) return [];
    const availableIndices = new Set(
      (participantDateMap[hoveredDate] || []).map((info) => info.participantIndex)
    );
    return participantNames
      .map((name, idx) => ({ name, available: availableIndices.has(idx) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [hoveredDate, participantNames, participantDateMap]);

  const monthData = useMemo(() => {
    const data = [];
    const start = startOfDay(startDate);
    const end = endDate ? startOfDay(endDate) : addMonths(start, 3);
    const monthsToDisplay = Math.max(1, differenceInMonths(end, start) + 1);

    for (let i = 0; i < monthsToDisplay; i++) {
      const monthStart = startOfMonth(addMonths(start, i));
      const monthEnd = endOfMonth(monthStart);
      const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

      const day = getDay(monthStart);
      const startDayOfWeek = day === 0 ? 6 : day - 1;
      const paddingDays = Array(startDayOfWeek).fill(null);

      data.push({
        id: format(monthStart, 'yyyy-MM'),
        monthName: format(monthStart, 'MMMM yyyy'),
        days: allDays,
        paddingDays,
      });
    }
    return data;
  }, [startDate, endDate]);

  const renderHeatmapCell = (dateStr: string, participantInfos: ParticipantDateInfo[]) => {
    if (!participantInfos || participantInfos.length === 0) return null;

    const ratio = totalParticipants > 0 ? participantInfos.length / totalParticipants : 0;
    const isFullOverlap = ratio >= 1;
    // Dim at low ratios, bright at high ratios; full overlap handled separately
    const opacity = isFullOverlap ? 0.9 : 0.12 + ratio * 0.55;

    if (isFullOverlap) {
      return (
        <div
          className="absolute inset-0 rounded-xl"
          style={{ backgroundColor: FULL_OVERLAP_COLOR, opacity }}
        />
      );
    }

    if (participantInfos.length === 1) {
      const info = participantInfos[0];
      const color = participantColors[info.participantIndex % participantColors.length];
      if (info.type === 'all_day') {
        return (
          <div
            className="absolute inset-0 rounded-xl"
            style={{ backgroundColor: color, opacity }}
          />
        );
      }
      if (info.type === 'morning') {
        return (
          <div className="absolute inset-0 flex rounded-xl overflow-hidden">
            <div className="w-1/2 h-full" style={{ backgroundColor: color, opacity }} />
          </div>
        );
      }
      if (info.type === 'afternoon') {
        return (
          <div className="absolute inset-0 flex rounded-xl overflow-hidden">
            <div className="w-1/2 h-full" />
            <div className="w-1/2 h-full" style={{ backgroundColor: color, opacity }} />
          </div>
        );
      }
    }

    const segmentCount = participantInfos.length;
    return (
      <div className="absolute inset-0 flex rounded-xl overflow-hidden">
        {participantInfos.map((info, i) => {
          const color = participantColors[info.participantIndex % participantColors.length];
          return (
            <div
              key={i}
              className="h-full"
              style={{
                backgroundColor: color,
                opacity,
                width: `${100 / segmentCount}%`,
              }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-12">
      {monthData.map((month) => (
        <div key={month.id} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-foreground/80 pl-1">{month.monthName}</h3>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {WEEKDAYS.map((day) => (
              <div
                key={`${month.id}-${day}`}
                className="text-center text-xs font-medium text-muted-foreground pb-2"
              >
                {day}
              </div>
            ))}

            {month.paddingDays.map((_, i) => (
              <div key={`${month.id}-pad-${i}`} className="aspect-square" />
            ))}

            {month.days.map((date) => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const isPastDate = isBefore(date, today);
              const isOutsideRange =
                (startDate && isBefore(date, startOfDay(startDate))) ||
                (endDate && isAfter(date, startOfDay(endDate)));
              const selectedType = selectedAvailabilities.get(dateStr);
              const participantInfos = participantDateMap[dateStr] || [];
              const counts = availabilityMap[dateStr] || { all_day: 0, morning: 0, afternoon: 0 };
              const totalCount = counts.all_day + counts.morning + counts.afternoon;

              let cellClasses =
                'aspect-square rounded-xl flex flex-col items-center justify-center text-sm sm:text-base transition-all duration-200 ease-out relative overflow-hidden bg-secondary';

              if (readonly) {
                cellClasses = cn(cellClasses, 'cursor-default');
                if ((isPastDate || isOutsideRange) && totalCount === 0) {
                  cellClasses = cn(cellClasses, 'opacity-30 bg-transparent text-muted-foreground');
                } else if (totalParticipants > 0 && totalCount === totalParticipants) {
                  cellClasses = cn(cellClasses, 'font-bold text-white neon-day-full-overlap');
                }
              } else {
                if (isPastDate || isOutsideRange) {
                  cellClasses = cn(
                    cellClasses,
                    'opacity-30 cursor-not-allowed bg-transparent text-muted-foreground'
                  );
                } else {
                  cellClasses = cn(
                    cellClasses,
                    'cursor-pointer hover:bg-secondary/80 hover:scale-[0.98]',
                    selectedType && 'scale-95 neon-day-selected'
                  );
                }
              }

              return (
                <motion.button
                  key={dateStr}
                  data-testid={`calendar-day-${dateStr}`}
                  disabled={!readonly && (isPastDate || isOutsideRange)}
                  onClick={() => onToggleDate?.(dateStr)}
                  className={cellClasses}
                  whileTap={!readonly && !isPastDate ? { scale: 0.9 } : {}}
                  initial={false}
                  onMouseEnter={
                    readonly && participantNames.length > 0 && !isOutsideRange
                      ? (e) => {
                          setHoveredDate(dateStr);
                          setTooltipAnchor(e.currentTarget.getBoundingClientRect());
                        }
                      : undefined
                  }
                  onMouseLeave={readonly ? () => setHoveredDate(null) : undefined}
                >
                  {!readonly && selectedType && (
                    <div className="absolute inset-0 flex">
                      {(selectedType === 'all_day' || selectedType === 'morning') && (
                        <div
                          className={cn(
                            'h-full bg-primary/80',
                            selectedType === 'all_day' ? 'w-full' : 'w-1/2'
                          )}
                        />
                      )}
                      {selectedType === 'afternoon' && (
                        <>
                          <div className="w-1/2 h-full" />
                          <div className="w-1/2 h-full bg-primary/80" />
                        </>
                      )}
                    </div>
                  )}

                  {readonly && renderHeatmapCell(dateStr, participantInfos)}

                  <span
                    className={cn(
                      'relative z-10',
                      isToday(date) &&
                        !selectedType &&
                        !readonly &&
                        'font-bold underline underline-offset-4',
                      selectedType && !readonly && 'text-primary-foreground font-bold',
                      readonly && totalCount > 0 && 'font-semibold text-white drop-shadow-sm'
                    )}
                  >
                    {format(date, 'd')}
                  </span>

                  {readonly && totalCount > 0 && (
                    <span className="relative z-10 text-[0.55rem] font-bold text-white/90 drop-shadow-sm">
                      {totalCount}/{totalParticipants}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Hover tooltip for readonly heatmap cells */}
      {readonly && hoveredDate && tooltipAnchor && tooltipParticipants.length > 0 && (
        <div
          className="bg-card/95 backdrop-blur-xl border border-white/10 rounded-xl p-3 neon-card pointer-events-none"
          style={{
            position: 'fixed',
            top: tooltipAnchor.bottom + 8,
            left: tooltipAnchor.left + tooltipAnchor.width / 2,
            transform: 'translateX(-50%)',
            zIndex: 9999,
          }}
        >
          <div className="flex flex-col gap-1.5 min-w-[120px]">
            {tooltipParticipants.map(({ name, available }) => (
              <div key={name} className="flex items-center gap-2 text-sm whitespace-nowrap">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    available
                      ? 'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.9)]'
                      : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]'
                  )}
                />
                <span className={available ? 'text-foreground' : 'text-muted-foreground/60'}>
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
