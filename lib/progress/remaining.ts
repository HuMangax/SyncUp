import type { Assignment, PlanData, SessionStatus } from "@/lib/types";

const round2 = (x: number) => Math.round(x * 100) / 100;
const clampPct = (p: number) => Math.min(100, Math.max(0, p));

/**
 * remaining_hours = remaining_override        if set
 *                 = estimate x (1 - percent)  otherwise
 */
export function remainingHours(a: Assignment): number {
  if (a.status === "completed") return 0;
  const r = a.remaining_override ?? a.estimate_hours * (1 - a.percent_complete / 100);
  return Math.max(0, r);
}

/** Percent is the primary input. Editing it clears any manual remaining-hours override. */
export function setPercent(a: Assignment, percent: number): Assignment {
  const p = round2(clampPct(percent));
  return {
    ...a,
    percent_complete: p,
    remaining_override: null,
    status: p >= 100 ? "completed" : a.status === "completed" ? "active" : a.status,
  };
}

/** Manual "hours remaining": wins until percent is next edited. */
export function setRemaining(a: Assignment, hours: number): Assignment {
  const h = Math.max(0, Math.round(hours * 4) / 4);
  return { ...a, remaining_override: h, status: h === 0 ? "completed" : a.status === "completed" ? "active" : a.status };
}

/**
 * Record what happened to a session. Missed: full hours return to the pool, percent unchanged.
 * Partial: minutes done count as progress. Completed: the whole session counts.
 * Progress is prefilled from minutes done; the student can edit the percent afterwards.
 */
export function applySessionStatus(
  data: PlanData,
  sessionId: string,
  status: SessionStatus,
  minutesDone?: number,
): PlanData {
  const s = data.sessions.find((x) => x.id === sessionId);
  if (!s) return data;
  const length = (Date.parse(s.end_at) - Date.parse(s.start_at)) / 60_000;
  const minutes =
    status === "completed" ? length : status === "partial" ? Math.min(length, Math.max(0, minutesDone ?? 0)) : 0;
  const creditH = (minutes - (s.minutes_done ?? 0)) / 60; // re-marking only credits the difference

  const sessions = data.sessions.map((x) => (x.id === sessionId ? { ...x, status, minutes_done: minutes } : x));
  const assignments = data.assignments.map((a) => {
    if (a.id !== s.assignment_id || creditH === 0) return a;
    if (a.remaining_override != null) return setRemaining(a, a.remaining_override - creditH);
    const pct = a.percent_complete + (creditH / a.estimate_hours) * 100;
    return { ...setPercent(a, pct), remaining_override: null };
  });
  return { ...data, sessions, assignments };
}
