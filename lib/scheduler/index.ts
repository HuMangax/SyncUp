import type { DayLoad, Plan, PlannerState, StudySession } from "@/lib/types";
import { slotCeil, slotFloor, slotsToHours, slotToIso, roundUpToSlots, SLOTS_PER_HOUR } from "@/lib/time/slots";
import { buildGrid, lockedSessions } from "./availability";
import { effectiveDeadlineSlot, examCapFor, pace, paddedRemainingHours, type Item, type SortMode } from "./pace";
import { limitsOf, type Placed } from "./place";

export { effectiveDeadlineSlot, paddedRemainingHours, remainingHours } from "./pace";
export { isLocked, lockedSessions } from "./availability";

const HORIZON_DAYS = 28;
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * schedule(state, now) -> Plan. Pure and deterministic: no I/O, no system clock, no randomness.
 * Locked sessions (done, partial, pinned, starting within 2 h) stay where they are and occupy
 * time; every other future scheduled session is replaced by the new plan.
 */
export function schedule(state: PlannerState, now: string): Plan {
  const { settings } = state;
  const L = limitsOf(settings);
  const h0 = slotCeil(now);
  const locked = lockedSessions(state.sessions, h0).sort(byId);
  const assignments = [...state.assignments].sort(byId);

  // Hours already covered by locked sessions that have not happened yet (pinned / starting soon).
  const creditSlots = new Map<string, number>();
  for (const s of locked) {
    if (s.status !== "scheduled") continue;
    const n = Math.max(0, slotCeil(s.end_at) - Math.max(slotFloor(s.start_at), h0));
    creditSlots.set(s.assignment_id, (creditSlots.get(s.assignment_id) ?? 0) + n);
  }

  const baseItems = (): Item[] =>
    assignments
      .map((a) => {
        const need = roundUpToSlots(paddedRemainingHours(a)) - (creditSlots.get(a.id) ?? 0);
        return { a, deadline: effectiveDeadlineSlot(a), need, examCap: examCapFor(a, need, L) };
      })
      .filter((it) => it.need > 0 && it.deadline > h0);

  const latest = Math.max(h0, ...baseItems().map((it) => it.deadline));
  const h1 = Math.min(latest, h0 + HORIZON_DAYS * 24 * SLOTS_PER_HOUR);

  const attempt = (mode: SortMode) => {
    const grid = buildGrid(settings, [...state.busy].sort((a, b) => a.start_at.localeCompare(b.start_at) || a.event_id.localeCompare(b.event_id)), locked, h0, h1);
    const items = baseItems();
    const placed = pace(grid, items, mode, settings, L);
    return { grid, items, placed };
  };

  // Shortage mode: if the deadline-first pass cannot fit everything, hand scarce capacity out
  // by priority first, so low-priority work absorbs the shortfall.
  let result = attempt("deadline");
  if (result.items.some((it) => it.need > 0)) result = attempt("shortage");

  // Assignments whose deadline already passed (or is inside lead time) cannot be placed at all.
  const unplaced: Record<string, number> = {};
  for (const a of assignments) {
    const need = roundUpToSlots(paddedRemainingHours(a)) - (creditSlots.get(a.id) ?? 0);
    const it = result.items.find((x) => x.a.id === a.id);
    const left = it ? it.need : need > 0 ? need : 0;
    if (left > 0) unplaced[a.id] = Math.round(slotsToHours(left) * 100) / 100;
  }

  const sessions = tagSubtasks(state, toSessions(result.placed, state.plan_version + 1), creditSlots);

  const loadByDay: DayLoad[] = result.grid.days.map((d) => ({
    day: d.key,
    planned_hours: slotsToHours(d.lockedSlots + d.usedSlots),
    capacity_hours: d.freeDay
      ? 0
      : Math.min(settings.max_hours_per_day, slotsToHours(d.initialFree + d.lockedSlots)),
  }));

  return { sessions, unplaced, loadByDay, warnings: [] };
}

function toSessions(placed: Placed[], version: number): StudySession[] {
  return placed
    .map((p) => ({
      id: `s-${p.assignment_id}-${p.start}`,
      assignment_id: p.assignment_id,
      subtask_id: null,
      start_at: slotToIso(p.start),
      end_at: slotToIso(p.end),
      status: "scheduled" as const,
      minutes_done: 0,
      pinned: false,
      plan_version: version,
    }))
    .sort((a, b) => a.start_at.localeCompare(b.start_at) || byId(a, b));
}

/**
 * Subtasks form a queue consumed in order_idx order: walk each assignment's sessions
 * chronologically and tag each with the subtask covering that point of the work.
 */
function tagSubtasks(state: PlannerState, sessions: StudySession[], credit: Map<string, number>): StudySession[] {
  const out = sessions.map((s) => ({ ...s }));
  for (const a of state.assignments) {
    const subs = state.subtasks
      .filter((t) => t.assignment_id === a.id)
      .sort((x, y) => x.order_idx - y.order_idx || byId(x, y));
    if (subs.length === 0) continue;
    const rem = subs.map((t) => Math.max(0, t.estimate_hours * (1 - t.percent_complete / 100)));
    const totalRem = rem.reduce((x, y) => x + y, 0);
    const totalSlots = roundUpToSlots(paddedRemainingHours(a));
    if (totalRem <= 0 || totalSlots <= 0) continue;
    const bounds: number[] = [];
    let acc = 0;
    for (const r of rem) bounds.push((acc += (r / totalRem) * totalSlots));

    let pos = credit.get(a.id) ?? 0;
    for (const s of out.filter((x) => x.assignment_id === a.id)) {
      const idx = bounds.findIndex((b) => pos < b - 1e-9);
      s.subtask_id = subs[idx === -1 ? subs.length - 1 : idx].id;
      pos += slotFloor(s.end_at) - slotFloor(s.start_at);
    }
  }
  return out;
}
