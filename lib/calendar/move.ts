import { DateTime } from "luxon";
import type { EventOccurrence, StudySession, UserSettings } from "@/lib/types";
import { parseHM } from "@/lib/time/slots";

export type MoveCheck = { ok: true } | { ok: false; reason: string };

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

/**
 * Can a study session be placed at `startIso`? The student dragged it, so we check the hard limits
 * the scheduler honors: not past or too soon, awake hours, no calendar event, no other session.
 */
export function validateMove(
  session: StudySession,
  startIso: string,
  opts: { now: string; settings: UserSettings; occurrences: EventOccurrence[]; sessions: StudySession[] },
): MoveCheck {
  const len = Date.parse(session.end_at) - Date.parse(session.start_at);
  const start = Date.parse(startIso);
  const end = start + len;
  if (start < Date.parse(opts.now) + 2 * 3_600_000) return { ok: false, reason: "Too soon. Pick a time at least 2 hours away." };

  const zone = opts.settings.timezone;
  const dt = DateTime.fromMillis(start, { zone });
  const startMin = dt.hour * 60 + dt.minute;
  const endMin = startMin + len / 60_000;
  const wake = parseHM(opts.settings.wake_time);
  let bed = parseHM(opts.settings.bed_time);
  if (bed <= wake) bed += 1440;
  if (startMin < wake || endMin > bed) return { ok: false, reason: "That’s outside your awake hours." };

  if (opts.occurrences.some((o) => !o.cancelled && overlaps(start, end, Date.parse(o.start_at), Date.parse(o.end_at))))
    return { ok: false, reason: "That time is taken by a calendar event." };
  if (opts.sessions.some((x) => x.id !== session.id && x.status !== "cancelled" && x.status !== "missed" && overlaps(start, end, Date.parse(x.start_at), Date.parse(x.end_at))))
    return { ok: false, reason: "Another study session is already there." };
  return { ok: true };
}
