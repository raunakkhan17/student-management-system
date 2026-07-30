'use client';

import { Coffee, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DayOfWeek, SlotPayload, TimetablePeriod, TimetableSlot } from '@/types/timetable';
import { DAY_SHORT, SLOT_TYPE_LABELS, WEEK_DAYS } from '@/types/timetable';

/** A slot keyed for O(1) lookup by day + period. */
export type SlotMap = Map<string, SlotPayload & { index: number }>;

export function slotKey(day: DayOfWeek, periodId: string): string {
  return `${day}:${periodId}`;
}

/** Builds the lookup map the grid renders from. */
export function buildSlotMap(slots: SlotPayload[]): SlotMap {
  const map: SlotMap = new Map();
  slots.forEach((slot, index) => {
    map.set(slotKey(slot.dayOfWeek, slot.periodId), { ...slot, index });
  });
  return map;
}

/** Converts server slots into the editable payload shape. */
export function slotsToPayload(slots: TimetableSlot[]): SlotPayload[] {
  return slots.map((slot) => ({
    dayOfWeek: slot.dayOfWeek,
    periodId: slot.periodId,
    classSubjectId: slot.classSubjectId,
    teacherId: slot.teacherId,
    roomId: slot.roomId,
    type: slot.type,
    ...(slot.note ? { note: slot.note } : {}),
  }));
}

export interface SlotDisplay {
  subjectName: string | null;
  subjectCode: string | null;
  teacherName: string | null;
  roomName: string | null;
}

interface TimetableGridProps {
  periods: TimetablePeriod[];
  slots: SlotMap;
  /** Resolves ids to display names — the grid itself holds no lookup tables. */
  describe: (slot: SlotPayload) => SlotDisplay;
  /** Cell indices that failed conflict validation. */
  conflictIndices?: Set<number>;
  onCellClick?: (day: DayOfWeek, period: TimetablePeriod) => void;
  readOnly?: boolean;
  days?: DayOfWeek[];
}

/**
 * Weekly timetable grid: periods as rows, days as columns.
 *
 * Scrolls horizontally inside its own container so the page never scrolls
 * sideways on narrow screens.
 */
export function TimetableGrid({
  periods,
  slots,
  describe,
  conflictIndices,
  onCellClick,
  readOnly = false,
  days = WEEK_DAYS,
}: TimetableGridProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[52rem] border-separate border-spacing-1">
        <thead>
          <tr>
            <th scope="col" className="text-muted-foreground w-32 px-2 pb-2 text-left text-xs font-semibold tracking-wider uppercase">
              Period
            </th>
            {days.map((day) => (
              <th
                key={day}
                scope="col"
                className="text-muted-foreground px-2 pb-2 text-center text-xs font-semibold tracking-wider uppercase"
              >
                {DAY_SHORT[day]}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {periods.map((period) => (
            <tr key={period.id}>
              <th scope="row" className="bg-muted/50 rounded-md px-3 py-2 text-left align-middle">
                <span className="block text-sm font-medium">{period.name}</span>
                <span className="text-muted-foreground block text-xs tabular-nums">
                  {period.startTime}–{period.endTime}
                </span>
              </th>

              {days.map((day) => {
                // Break periods are institution-wide; no per-day content.
                if (period.isBreak) {
                  return (
                    <td key={day} className="bg-muted/30 rounded-md px-2 py-3 text-center">
                      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                        <Coffee className="size-3.5" aria-hidden />
                        {period.name}
                      </span>
                    </td>
                  );
                }

                const slot = slots.get(slotKey(day, period.id));
                const hasConflict = slot !== undefined && conflictIndices?.has(slot.index) === true;
                const display = slot ? describe(slot) : null;

                const cellContent = slot ? (
                  <>
                    <span className="block truncate text-sm font-medium">
                      {display?.subjectName ?? SLOT_TYPE_LABELS[slot.type]}
                    </span>
                    {display?.teacherName && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {display.teacherName}
                      </span>
                    )}
                    {display?.roomName && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {display.roomName}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                    {!readOnly && <Plus className="size-3.5" aria-hidden />}
                    {readOnly ? '—' : 'Add'}
                  </span>
                );

                const baseClass = cn(
                  'h-20 w-full rounded-md border p-2 text-left align-top transition-colors',
                  slot ? 'bg-card' : 'bg-muted/20 border-dashed',
                  hasConflict && 'border-destructive bg-destructive-muted',
                  !readOnly && 'hover:border-primary/50 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                );

                return (
                  <td key={day} className="p-0 align-top">
                    {readOnly ? (
                      <div className={baseClass}>{cellContent}</div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCellClick?.(day, period)}
                        className={baseClass}
                        aria-label={`${DAY_SHORT[day]} ${period.name}${
                          display?.subjectName ? `: ${display.subjectName}` : ' — empty'
                        }`}
                      >
                        {cellContent}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
