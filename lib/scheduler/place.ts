import type { Slot, UserSettings } from "@/lib/types";
import { localSlot, minutesToSlots } from "@/lib/time/slots";
import { block, isFree, type Day, type Grid } from "./availability";

export type Placed = { assignment_id: string; start: Slot; end: Slot };

export type SessionLimits = { min: number; target: number; max: number; brk: number };

export const limitsOf = (s: UserSettings): SessionLimits => ({
  min: minutesToSlots(s.session_min),
  target: minutesToSlots(s.session_target),
  max: minutesToSlots(s.session_max),
  brk: minutesToSlots(s.break_min),
});

/**
 * Choose a session length near the target. Never leaves a remainder smaller than the minimum
 * when that can be avoided (merge it into this session if under the max, else leave a full minimum).
 */
export function sessionLength(remaining: number, runLen: number, L: SessionLimits): number {
  let len = remaining <= L.max ? remaining : L.target;
  if (remaining - len > 0 && remaining - len < L.min) len = remaining - L.min;
  len = Math.min(len, runLen);
  const left = remaining - len;
  if (left > 0 && left < L.min && remaining - L.min >= L.min) len = Math.min(len, remaining - L.min);
  return len;
}

/**
 * Step 3: place up to `take` slots of one item on one day, before `deadline`.
 * Pass A uses preferred windows only; pass B uses any other waking free time. Both first look
 * for a run that fits a whole session, and only then fall back to shorter fragments.
 * Reserves a break after each session. Returns the placed sessions.
 */
export function placeInDay(
  g: Grid,
  day: Day,
  assignmentId: string,
  take: number,
  deadline: Slot,
  settings: UserSettings,
  L: SessionLimits,
): Placed[] {
  const lo = Math.max(day.start, g.h0);
  const hi = Math.min(day.end, deadline, g.h1);
  if (hi - lo < L.min || take < L.min) return [];

  const clip = (a: Slot, b: Slot): [Slot, Slot] => [Math.max(a, lo), Math.min(b, hi)];
  const preferred = settings.preferred_windows
    .map((w) => clip(localSlot(day.key, w.start, settings.timezone), localSlot(day.key, w.end, settings.timezone)))
    .filter(([a, b]) => b - a >= L.min)
    .sort((x, y) => x[0] - y[0]);
  const anywhere: [Slot, Slot][] = [[lo, hi]];
  // Whole sessions first (preferred, then any waking time); only then accept shorter fragments.
  const passes: { ranges: [Slot, Slot][]; whole: boolean }[] = [
    { ranges: preferred, whole: true },
    { ranges: anywhere, whole: true },
    { ranges: preferred, whole: false },
    { ranges: anywhere, whole: false },
  ];

  const out: Placed[] = [];
  let remaining = take;
  for (const { ranges, whole } of passes) {
    for (const [a, b] of ranges) {
      let t = a;
      while (remaining >= L.min && t < b) {
        if (!isFree(g, t)) {
          t++;
          continue;
        }
        let r = t;
        while (r < b && isFree(g, r)) r++;
        const run = r - t;
        const wanted = sessionLength(remaining, Number.POSITIVE_INFINITY, L);
        if (run < L.min || (whole && run < wanted)) {
          t = r;
          continue;
        }
        const len = sessionLength(remaining, run, L);
        if (len < L.min) break;
        out.push({ assignment_id: assignmentId, start: t, end: t + len });
        block(g, t, t + len + L.brk);
        remaining -= len;
        t += len + L.brk;
      }
    }
  }
  return out;
}
