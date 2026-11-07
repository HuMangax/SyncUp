import type { Assignment, AssignmentType, Level, Slot, UserSettings } from "@/lib/types";
import { hoursToSlots, slotFloor, SLOTS_PER_HOUR } from "@/lib/time/slots";
import { remainingHours } from "@/lib/progress/remaining";
import { countFree, type Grid } from "./availability";
import { placeInDay, type Hints, type Placed, type SessionLimits } from "./place";

export const LEAD_HOURS: Record<AssignmentType, number> = { assignment: 3, project: 6, exam: 12 };
export const DIFFICULTY_PAD: Record<Level, number> = { 1: 1.0, 2: 1.1, 3: 1.2 };
export const EXAM_DAILY_CAP_SLOTS = 3 * SLOTS_PER_HOUR;

export const effectiveDeadlineSlot = (a: Assignment): Slot =>
  slotFloor(new Date(Date.parse(a.due_at) - LEAD_HOURS[a.type] * 3_600_000).toISOString());


/** Remaining hours padded by difficulty (x1.0 / x1.1 / x1.2). */
export const paddedRemainingHours = (a: Assignment): number => remainingHours(a) * DIFFICULTY_PAD[a.difficulty];

export type Item = {
  a: Assignment;
  deadline: Slot; // effective deadline
  need: number; // slots still to place
  examCap: number; // max slots per day for this item
};

export type SortMode = "deadline" | "shortage";

const cmp = (mode: SortMode) => (x: Item, y: Item) => {
  const byDeadline = x.deadline - y.deadline;
  const byPriority = y.a.priority - x.a.priority;
  const primary = mode === "deadline" ? byDeadline || byPriority : byPriority || byDeadline;
  return primary || y.a.difficulty - x.a.difficulty || (x.a.id < y.a.id ? -1 : x.a.id > y.a.id ? 1 : 0);
};

/** Exams: 3 h per day; when the exam needs 6 h or more, spread over at least 3 days. */
export function examCapFor(a: Assignment, needSlots: number, L: SessionLimits): number {
  if (a.type !== "exam") return Number.POSITIVE_INFINITY;
  if (needSlots >= hoursToSlots(6)) return Math.min(EXAM_DAILY_CAP_SLOTS, Math.max(Math.ceil(needSlots / 3), L.min));
  return EXAM_DAILY_CAP_SLOTS;
}

/**
 * Step 2: pace the work day by day. Each active item gets a quota of its remaining work
 * spread over its remaining eligible days (at least one target-length session, so work is not
 * fragmented), capped by the day's remaining capacity and the exam cap. A catch-up pass then
 * fills any leftover capacity before each deadline. What still does not fit is the shortfall.
 */
export function pace(
  g: Grid,
  items: Item[],
  mode: SortMode,
  settings: UserSettings,
  L: SessionLimits,
  hints?: Hints,
): Placed[] {
  const maxDay = hoursToSlots(settings.max_hours_per_day);
  const order = [...items].sort(cmp(mode));
  const placedOn = new Map<string, number>(); // `${id}|${dayIdx}` -> slots
  const out: Placed[] = [];

  const capLeft = (i: number) => {
    const d = g.days[i];
    return d.freeDay ? 0 : Math.max(0, maxDay - d.lockedSlots - d.usedSlots);
  };
  const eligible = (i: number, it: Item) => {
    const d = g.days[i];
    return capLeft(i) >= L.min && countFree(g, d.start, Math.min(d.end, it.deadline)) >= L.min;
  };
  const daysLeft = (from: number, it: Item) => {
    let n = 0;
    for (let j = from; j < g.days.length && g.days[j].start < it.deadline; j++) if (eligible(j, it)) n++;
    return n;
  };

  const run = (i: number, it: Item, want: number) => {
    const key = `${it.a.id}|${i}`;
    const already = placedOn.get(key) ?? 0;
    let take = Math.min(want, capLeft(i), it.examCap - already, it.need);
    // Do not strand a remainder smaller than one minimum session.
    const left = it.need - take;
    if (left > 0 && left < L.min) {
      if (it.need <= Math.min(capLeft(i), it.examCap - already)) take = it.need;
      else take = it.need - L.min;
    }
    if (take < L.min) return;
    const placed = placeInDay(g, g.days[i], it.a.id, take, it.deadline, settings, L, hints);
    const n = placed.reduce((s, p) => s + (p.end - p.start), 0);
    g.days[i].usedSlots += n;
    it.need -= n;
    placedOn.set(key, already + n);
    out.push(...placed);
  };

  // Main pacing pass
  for (let i = 0; i < g.days.length; i++) {
    const d = g.days[i];
    if (d.freeDay) continue;
    for (const it of order) {
      if (it.need <= 0 || it.deadline <= Math.max(d.start, g.h0)) continue;
      if (capLeft(i) < L.min) break;
      const dl = daysLeft(i, it);
      if (dl === 0) continue;
      const quota = Math.max(Math.ceil(it.need / dl), Math.min(L.target, it.need));
      run(i, it, quota);
    }
  }

  // Catch-up pass: use any remaining capacity before each deadline.
  for (const it of order) {
    for (let i = 0; i < g.days.length && it.need >= L.min; i++) {
      const d = g.days[i];
      if (d.freeDay || it.deadline <= Math.max(d.start, g.h0)) continue;
      run(i, it, it.need);
    }
  }
  return out;
}
