/**
 * components/Calendar.tsx — Multi-Month Calendar Grid
 *
 * This is the most complex component in the app. It serves two distinct modes
 * controlled by the `readonly` prop:
 *
 *   Interactive mode (readonly = false, default):
 *     Used on the left side of the Event page. The current user clicks cells
 *     to cycle through their availability states (all_day → morning → afternoon
 *     → unset). The parent controls the selected state; this component just
 *     fires `onToggleDate` callbacks and renders the current selections.
 *
 *   Read-only heatmap mode (readonly = true):
 *     Used on the right side of the Event page. Shows the group's aggregate
 *     availability as a colour-coded heatmap. Hovering a cell shows a tooltip
 *     listing who is and isn't available that day. No cells are clickable.
 *
 * Months are computed from `startDate` and `endDate` and rendered sequentially
 * in a vertical stack. Each month is a CSS grid with 7 columns (Mon–Sun).
 */

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

/**
 * ParticipantDateInfo — Describes one participant's availability on a specific date.
 *
 * This type is exported and used by Event.tsx to build the `participantDateMap`
 * structure that gets passed to the heatmap Calendar.
 *
 * `participantIndex` is an index into the event's `participants` array, used to
 * look up both the participant's name (for the tooltip) and their assigned colour
 * (from PARTICIPANT_COLORS) without duplicating that data.
 */
export interface ParticipantDateInfo {
  participantIndex: number;
  type: AvailabilityType;
}

/**
 * CalendarProps — All props the Calendar component accepts.
 *
 * Most props are only relevant in one mode (interactive or readonly). TypeScript
 * doesn't enforce this — it's the caller's responsibility to pass the right set.
 *
 * Props shared by both modes:
 *   - startDate / endDate: the date range to display. Dates outside this range
 *     are rendered with reduced opacity and cannot be interacted with.
 *
 * Interactive-mode-only props:
 *   - selectedAvailabilities: Map<dateString, AvailabilityType> — the current
 *     user's selections. The parent (Event.tsx) owns this state.
 *   - onToggleDate: callback fired when the user clicks a date cell.
 *
 * Readonly-mode-only props:
 *   - availabilityMap: aggregated count of each availability type per date.
 *   - totalParticipants: used to compute the coverage ratio (N/total) shown in cells.
 *   - participantDateMap: per-date list of who is available, used for the tooltip.
 *   - participantColors: ordered array of colours assigned to participants.
 *   - participantNames: ordered array of participant names for the tooltip.
 */
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

/** Ordered weekday labels, starting Monday (ISO week convention). */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * PARTICIPANT_COLORS — The rotation of colours assigned to participants.
 *
 * Participants are assigned colours by index: participant 0 gets index 0,
 * participant 1 gets index 1, and so on. The modulo operator wraps around if
 * there are more than 12 participants, so colours repeat rather than running out.
 *
 * Exported so Event.tsx can use the same array when rendering the legend below
 * the heatmap, keeping colours consistent between the calendar cells and the legend.
 */
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

/**
 * FULL_OVERLAP_COLOR — The special "everyone available" highlight colour.
 *
 * When ALL participants are available on a date, the heatmap cell gets this
 * distinctive green colour instead of the individual participant colours.
 * The same colour is shown in the legend as "Everyone".
 */
const FULL_OVERLAP_COLOR = '#22c55e';

export { PARTICIPANT_COLORS };

/**
 * Calendar — The main exported component.
 *
 * Default prop values use ES6 destructuring defaults. This means callers don't
 * have to pass every prop — safe defaults are used for optional ones.
 *
 * Example — interactive usage:
 *   <Calendar
 *     startDate={new Date('2025-01-01')}
 *     endDate={new Date('2025-03-31')}
 *     selectedAvailabilities={myMap}
 *     onToggleDate={handleToggle}
 *   />
 *
 * Example — readonly heatmap:
 *   <Calendar
 *     readonly
 *     startDate={...}
 *     endDate={...}
 *     availabilityMap={heatmapData.map}
 *     totalParticipants={3}
 *     participantDateMap={heatmapData.participantDateMap}
 *     participantColors={PARTICIPANT_COLORS}
 *     participantNames={['Alice', 'Bob', 'Carol']}
 *   />
 */
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

  /**
   * hoveredDate / tooltipAnchor — Tooltip state for the readonly heatmap.
   *
   * `hoveredDate`: the YYYY-MM-DD string of the currently hovered cell, or null.
   * `tooltipAnchor`: the `DOMRect` (position/size) of the hovered cell, obtained
   *   from `e.currentTarget.getBoundingClientRect()`. We use this to position the
   *   tooltip directly below the cell using fixed coordinates, which avoids the
   *   tooltip being clipped by overflow:hidden containers.
   *
   * Both are `null` when nothing is hovered and no tooltip is shown.
   */
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<DOMRect | null>(null);

  /**
   * tooltipParticipants — Sorted list of participant availability for the tooltip.
   *
   * `useMemo` caches the result of this computation and only re-runs it when
   * `hoveredDate`, `participantNames`, or `participantDateMap` changes. Without
   * memoisation this would recompute on every render, which is wasteful since
   * it only changes when the hovered cell changes.
   *
   * Algorithm:
   *   1. Build a Set of participant indices who are available on `hoveredDate`.
   *   2. Map all participant names to `{ name, available: boolean }`.
   *   3. Sort alphabetically so the list is stable regardless of array order.
   *
   * This produces a list where both available (green dot) and unavailable (red dot)
   * participants appear, giving a complete picture of the day's coverage.
   */
  const tooltipParticipants = useMemo(() => {
    if (!hoveredDate || !participantNames.length) return [];
    const availableIndices = new Set(
      (participantDateMap[hoveredDate] || []).map((info) => info.participantIndex)
    );
    return participantNames
      .map((name, idx) => ({ name, available: availableIndices.has(idx) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [hoveredDate, participantNames, participantDateMap]);

  /**
   * monthData — Pre-computed display data for every month in the date range.
   *
   * This is another memoised computation, only re-running when the date range
   * changes. It produces an array of month objects, each containing:
   *   - `id`: a stable string key (e.g. "2025-03") used by React's reconciler
   *     to track elements across re-renders without re-mounting them.
   *   - `monthName`: the display string (e.g. "March 2025").
   *   - `days`: all Date objects in the month (from date-fns `eachDayOfInterval`).
   *   - `paddingDays`: empty placeholder cells to align the first day of the
   *     month to the correct column in the 7-column grid.
   *
   * Grid alignment (paddingDays):
   *   CSS grid always starts filling from column 1 (Monday). If a month starts
   *   on a Wednesday, we need 2 empty cells before the "1" cell to push it to
   *   the correct column. `getDay()` returns 0 (Sunday) through 6 (Saturday).
   *   We convert to a Monday-anchored index: Sunday (0) → 6, Monday (1) → 0,
   *   etc., then create that many null-filled slots.
   */
  const monthData = useMemo(() => {
    const data = [];
    const start = startOfDay(startDate);
    const end = endDate ? startOfDay(endDate) : addMonths(start, 3);
    // Always show at least 1 month even if start === end.
    const monthsToDisplay = Math.max(1, differenceInMonths(end, start) + 1);

    for (let i = 0; i < monthsToDisplay; i++) {
      const monthStart = startOfMonth(addMonths(start, i));
      const monthEnd = endOfMonth(monthStart);
      const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

      // Convert JS's Sunday=0 convention to Monday=0 for ISO-week grid alignment.
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

  /**
   * renderHeatmapCell — Renders the coloured background layer for a heatmap cell.
   *
   * This function is only called in readonly mode. It returns a positioned `<div>`
   * that acts as a colour fill behind the date number. The visual encoding:
   *
   *   Full overlap (everyone available):
   *     Solid FULL_OVERLAP_COLOR at high opacity — a clear "everyone's free!" signal.
   *
   *   Single participant available:
   *     Their colour at a ratio-scaled opacity.
   *     - all_day: fills the full cell.
   *     - morning: fills the left half.
   *     - afternoon: fills the right half.
   *     This matches the visual language of the interactive calendar.
   *
   *   Multiple participants available (partial overlap):
   *     The cell is divided into equal-width vertical strips, one per participant.
   *     Each strip uses that participant's assigned colour. This gives a quick
   *     visual sense of how many people overlap on a given day.
   *
   * Opacity scaling:
   *   `opacity = 0.12 + ratio * 0.55` maps a ratio of 0→1 to opacity 0.12→0.67.
   *   The 0.12 minimum ensures a cell with even one person is clearly visible.
   *   A higher ratio (more people available) produces a more vivid colour,
   *   creating the "heat" in the heatmap without needing a different colour per step.
   *
   * Returns null when no participants are available on this date (no fill rendered).
   */
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

    // Multiple participants: divide cell into equal vertical colour strips.
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

          {/**
           * 7-column grid: weekday headers + day cells.
           *
           * CSS Grid automatically wraps cells after 7 columns, so all we need is
           * `grid-cols-7` and then render cells in order — the browser handles
           * the row breaks. The `gap-1 sm:gap-2` adds spacing between cells
           * (smaller on mobile to fit more dates).
           */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {/* Weekday header row (Mon, Tue, ..., Sun) */}
            {WEEKDAYS.map((day) => (
              <div
                key={`${month.id}-${day}`}
                className="text-center text-xs font-medium text-muted-foreground pb-2"
              >
                {day}
              </div>
            ))}

            {/**
             * Padding cells — push the first real day to the correct column.
             * These are empty `<div>`s with the same `aspect-square` as real
             * cells so the grid stays aligned. The underscore in `(_, i)` is
             * a convention for "I don't use this value" (the null array item).
             */}
            {month.paddingDays.map((_, i) => (
              <div key={`${month.id}-pad-${i}`} className="aspect-square" />
            ))}

            {/* Day cells */}
            {month.days.map((date) => {
              const dateStr = format(date, 'yyyy-MM-dd');

              // Past dates and dates outside the event's range cannot be selected.
              const isPastDate = isBefore(date, today);
              const isOutsideRange =
                (startDate && isBefore(date, startOfDay(startDate))) ||
                (endDate && isAfter(date, startOfDay(endDate)));

              // Current user's selection for this date (interactive mode only).
              const selectedType = selectedAvailabilities.get(dateStr);

              // Pre-computed heatmap data for this date (readonly mode only).
              const participantInfos = participantDateMap[dateStr] || [];
              const counts = availabilityMap[dateStr] || { all_day: 0, morning: 0, afternoon: 0 };
              // Total people who marked ANY availability type on this date.
              const totalCount = counts.all_day + counts.morning + counts.afternoon;

              /**
               * cellClasses — Build the class string for this cell dynamically.
               *
               * We start with a base set of classes that all cells share, then
               * conditionally append classes based on the cell's state. The `cn`
               * helper handles conditional application cleanly.
               *
               * `aspect-square` makes the cell a perfect square regardless of the
               * available width — this is what makes the grid look good at any
               * screen size without hardcoded pixel dimensions.
               *
               * `relative overflow-hidden` is required so that the absolutely-
               * positioned colour fill layer (the availability highlight) stays
               * clipped to the cell's rounded corners.
               */
              let cellClasses =
                'aspect-square rounded-xl flex flex-col items-center justify-center text-sm sm:text-base transition-all duration-200 ease-out relative overflow-hidden bg-secondary';

              if (readonly) {
                cellClasses = cn(cellClasses, 'cursor-default');
                if ((isPastDate || isOutsideRange) && totalCount === 0) {
                  // Fade out empty past/out-of-range cells in readonly mode.
                  cellClasses = cn(cellClasses, 'opacity-30 bg-transparent text-muted-foreground');
                } else if (totalParticipants > 0 && totalCount === totalParticipants) {
                  // Full-overlap cells get the neon gold glow treatment.
                  cellClasses = cn(cellClasses, 'font-bold text-white neon-day-full-overlap');
                }
              } else {
                if (isPastDate || isOutsideRange) {
                  // Past/out-of-range cells are greyed out and not clickable.
                  cellClasses = cn(
                    cellClasses,
                    'opacity-30 cursor-not-allowed bg-transparent text-muted-foreground'
                  );
                } else {
                  cellClasses = cn(
                    cellClasses,
                    'cursor-pointer hover:bg-secondary/80 hover:scale-[0.98]',
                    // `scale-95` gives selected cells a slightly "pressed" look
                    // to visually separate them from unselected neighbours.
                    selectedType && 'scale-95 neon-day-selected'
                  );
                }
              }

              return (
                /**
                 * `motion.button` wraps each cell in a framer-motion button.
                 * Using `<button>` (not `<div>`) makes cells keyboard-focusable
                 * and accessible by default — important for screen readers.
                 *
                 * `whileTap` gives a press-down animation in interactive mode.
                 * `initial={false}` prevents the entry animation from playing
                 * on the initial render (which would make all cells animate in
                 * simultaneously and look chaotic).
                 *
                 * Mouse handlers (onMouseEnter, onMouseLeave) are only attached
                 * in readonly mode with participants, because tooltips are only
                 * meaningful on the heatmap. Skipping them in interactive mode
                 * avoids unnecessary event listener overhead.
                 */
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
                          // Capture the cell's viewport position so the tooltip
                          // can be placed directly below it with `position: fixed`.
                          setTooltipAnchor(e.currentTarget.getBoundingClientRect());
                        }
                      : undefined
                  }
                  onMouseLeave={readonly ? () => setHoveredDate(null) : undefined}
                >
                  {/**
                   * Interactive availability fill layer.
                   *
                   * Only rendered in interactive mode when this date is selected.
                   * Uses absolute positioning to fill the entire cell behind the
                   * date number (which sits at `z-10` above it).
                   *
                   * The fill is split at the midpoint for morning/afternoon:
                   *   - all_day: full-width fill.
                   *   - morning: left half filled.
                   *   - afternoon: left half empty, right half filled.
                   */}
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

                  {/* Heatmap colour fill (readonly mode) — see renderHeatmapCell. */}
                  {readonly && renderHeatmapCell(dateStr, participantInfos)}

                  {/**
                   * Date number — sits at z-10 so it renders above the colour
                   * fill layer. Conditionally styled:
                   *   - Today (unselected, interactive): bold + underline.
                   *   - Selected (interactive): white text (on the coloured fill).
                   *   - Has availability (readonly): white + drop shadow for contrast.
                   */}
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

                  {/**
                   * Coverage fraction badge (readonly mode).
                   *
                   * Shows "N/total" (e.g. "2/3") so viewers immediately know
                   * how many people are free without having to hover for the tooltip.
                   * Only shown when at least one person is available on that date.
                   */}
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

      {/**
       * Hover tooltip — appears below the hovered heatmap cell.
       *
       * `position: fixed` pins the tooltip to the viewport coordinate space,
       * which means it won't be clipped by any scrolling containers or
       * `overflow: hidden` ancestors. The `top` and `left` values come from
       * `tooltipAnchor` (the cell's `getBoundingClientRect()` snapshot).
       *
       * `pointer-events-none` prevents the tooltip from intercepting mouse
       * events (which would fire `onMouseLeave` on the cell and hide the
       * tooltip before the user could read it).
       *
       * `zIndex: 9999` ensures it appears above the sticky header.
       *
       * Only rendered when all three conditions are true:
       *   - We're in readonly mode (tooltips don't belong on the editor).
       *   - A cell is currently hovered.
       *   - We have an anchor position to place the tooltip.
       *   - There's at least one participant to list.
       */}
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
                {/**
                 * Green glowing dot = available, red glowing dot = not available.
                 * The box-shadow creates the glow effect using Tailwind's
                 * arbitrary value syntax: `shadow-[0_0_6px_rgba(...)]`.
                 */}
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
