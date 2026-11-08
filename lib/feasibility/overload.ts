import type { PlanData, Suggestion } from "@/lib/types";
import { toPlannerState } from "@/lib/planner";
import { buildGrid, countFree, lockedSessions } from "@/lib/scheduler/availability";
import { effectiveDeadlineSlot, paddedRemainingHours } from "@/lib/scheduler/pace";
import { remainingHours } from "@/lib/progress/remaining";
import { suggestions } from "@/lib/feasibility/check";
import { schedule } from "@/lib/scheduler";
import { hoursToSlots, roundUpToSlots, slotCeil, slotFloor, slotsToHours, SLOTS_PER_HOUR } from "@/lib/time/slots";

const WEEK_SLOTS = 7 * 24 * SLOTS_PER_HOUR;
const r1 = (x: number) => Math.round(x * 10) / 10;

export type Overload = {
  /** "over": more work than time. "heavy": it fits, but uses 90% or more of your time. */
  level: "over" | "heavy";
  /** Which stretch: 1 = the next 7 days, 2 = the next 14. */
  weeks: 1 | 2;
  needed_hours: number;
  available_hours: number;
  short_hours: number;
  /** Assignments whose deadline falls inside the window, biggest first. */
  assignment_ids: string[];
  suggestions: Suggestion[];
};

/**
 * Before the student falls behind: is the coming workload realistic?
 * needed    = padded remaining hours of everything due inside the window (minus pinned sessions already placed)
 * available = free study time in the window, within sleep, days off, events and the daily max.
 * Pure: same data and `now` give the same answer. Checks the next 7 days, then the next 14.
 */
export function detectOverload(data: PlanData, now: string): Overload | null {
  const state = toPlannerState(data, now);
  const { settings } = state;
  const h0 = slotCeil(now);
  const locked = lockedSessions(state.sessions, h0);
  const credit = new Map<string, number>();
  for (const s of locked) {
    if (s.status !== "scheduled") continue;
    credit.set(s.assignment_id, (credit.get(s.assignment_id) ?? 0) + Math.max(0, slotCeil(s.end_at) - Math.max(slotFloor(s.start_at), h0)));
  }
  const active = state.assignments.filter((a) => a.status !== "completed" && remainingHours(a) > 0);
  const need = (id: string, hrs: number) => Math.max(0, roundUpToSlots(hrs) - (credit.get(id) ?? 0));

  const grid = buildGrid(settings, state.busy, locked, h0, h0 + 2 * WEEK_SLOTS);
  const maxDay = hoursToSlots(settings.max_hours_per_day);
  const capacityUntil = (end: number) =>
    grid.days.reduce((sum, d) => {
      if (d.freeDay || d.start >= end) return sum;
      return sum + Math.min(Math.max(0, maxDay - d.lockedSlots), countFree(grid, d.start, Math.min(d.end, end)));
    }, 0);

  for (const weeks of [1, 2] as const) {
    const end = h0 + weeks * WEEK_SLOTS;
    const due = active.filter((a) => effectiveDeadlineSlot(a) <= end);
    const needed = slotsToHours(due.reduce((s, a) => s + need(a.id, paddedRemainingHours(a)), 0));
    const available = slotsToHours(capacityUntil(end));
    if (needed <= 0) continue;
    if (needed > 0.9 * available) {
      const short = Math.max(0, r1(needed - available));
      // What-ifs are measured against what the planner really cannot place right now.
      const unplaced = Object.values(schedule(state, now).unplaced).reduce((a, b) => a + b, 0);
      return {
        level: needed > available ? "over" : "heavy",
        weeks,
        needed_hours: r1(needed),
        available_hours: r1(available),
        short_hours: short,
        assignment_ids: [...due].sort((x, y) => paddedRemainingHours(y) - paddedRemainingHours(x) || x.id.localeCompare(y.id)).map((a) => a.id),
        suggestions: unplaced > 0 ? suggestions(state, now, Math.round(unplaced * 100) / 100) : [],
      };
    }
  }
  return null;
}
