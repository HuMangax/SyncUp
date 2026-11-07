import type { EventOccurrence, Slot, StudySession, UserSettings } from "@/lib/types";
import {
  addDays,
  dayRange,
  localSlot,
  minutesToSlots,
  parseHM,
  slotCeil,
  slotFloor,
  slotLocalDateKey,
  weekdayOf,
} from "@/lib/time/slots";

/** A session is locked (never moved) if done/partial, pinned, or starting within 2 hours of now. */
export const LOCK_WINDOW_SLOTS = 8; // 2 h

export function isLocked(s: StudySession, nowSlot: Slot): boolean {
  if (s.status === "completed" || s.status === "partial") return true;
  if (s.status !== "scheduled") return false; // missed / cancelled occupy nothing
  return s.pinned || slotFloor(s.start_at) < nowSlot + LOCK_WINDOW_SLOTS;
}

/** Sessions that occupy time in the new plan (locked and not missed/cancelled). */
export function lockedSessions(sessions: StudySession[], nowSlot: Slot): StudySession[] {
  return sessions.filter((s) => isLocked(s, nowSlot));
}

export type Day = {
  key: string; // local YYYY-MM-DD
  start: Slot; // local midnight
  end: Slot; // next local midnight
  freeDay: boolean;
  /** Study slots on this day already taken by locked sessions (count toward the daily max). */
  lockedSlots: number;
  /** Study slots placed by this run. */
  usedSlots: number;
  /** Free slots when the grid was built (for loadByDay capacity). */
  initialFree: number;
};

export type Grid = {
  h0: Slot; // first plannable slot (now, rounded up)
  h1: Slot; // end of horizon (exclusive)
  free: Uint8Array; // 1 = free, index = slot - h0
  days: Day[];
};

export const isFree = (g: Grid, t: Slot): boolean => t >= g.h0 && t < g.h1 && g.free[t - g.h0] === 1;

export function block(g: Grid, a: Slot, b: Slot): void {
  const lo = Math.max(a, g.h0);
  const hi = Math.min(b, g.h1);
  for (let t = lo; t < hi; t++) g.free[t - g.h0] = 0;
}

export function countFree(g: Grid, a: Slot, b: Slot): number {
  let n = 0;
  const lo = Math.max(a, g.h0);
  const hi = Math.min(b, g.h1);
  for (let t = lo; t < hi; t++) n += g.free[t - g.h0];
  return n;
}

/**
 * Step 1: free-slot grid. A slot is unavailable if it is before now; in the sleep window
 * (bed_time - wind_down .. wake_time, may cross midnight); overlaps a calendar event plus the
 * break buffer; on a free day; or occupied by a locked session (plus its break).
 */
export function buildGrid(
  settings: UserSettings,
  busy: EventOccurrence[],
  locked: StudySession[],
  h0: Slot,
  h1: Slot,
): Grid {
  const zone = settings.timezone;
  const n = Math.max(0, h1 - h0);
  const g: Grid = { h0, h1, free: new Uint8Array(n).fill(1), days: [] };
  const firstKey = slotLocalDateKey(h0, zone);
  const lastKey = slotLocalDateKey(Math.max(h0, h1 - 1), zone);
  const breakSlots = minutesToSlots(settings.break_min);

  // Days
  for (let k = firstKey; k <= lastKey; k = addDays(k, 1)) {
    const r = dayRange(k, zone);
    g.days.push({ key: k, start: r.start, end: r.end, freeDay: settings.free_days.includes(weekdayOf(k)), lockedSlots: 0, usedSlots: 0, initialFree: 0 });
  }

  // Free days
  for (const d of g.days) if (d.freeDay) block(g, d.start, d.end);

  // Sleep: the night that starts on local day k ends at wake time on k + 1.
  const bedAfterMidnight = parseHM(settings.bed_time) <= parseHM(settings.wake_time);
  const windSlots = Math.ceil(settings.wind_down_min / 15);
  for (let k = addDays(firstKey, -1); k <= lastKey; k = addDays(k, 1)) {
    const bedDay = bedAfterMidnight ? addDays(k, 1) : k;
    const start = localSlot(bedDay, settings.bed_time, zone) - windSlots;
    const end = localSlot(addDays(k, 1), settings.wake_time, zone);
    block(g, start, end);
  }

  // Calendar events + break buffer on both sides. Always unavailable.
  for (const e of busy) block(g, slotFloor(e.start_at) - breakSlots, slotCeil(e.end_at) + breakSlots);

  // Locked sessions occupy their time plus a break, and count toward their day's max.
  for (const s of locked) {
    const a = slotFloor(s.start_at);
    const b = slotCeil(s.end_at);
    block(g, a, b + breakSlots);
    const day = g.days.find((d) => a >= d.start && a < d.end);
    if (day) day.lockedSlots += b - a;
  }

  for (const d of g.days) d.initialFree = countFree(g, d.start, d.end);
  return g;
}
