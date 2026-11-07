import { expandEvents } from "@/lib/calendar/simulated";
import { createSeed } from "@/lib/demo/seed";
import { addDays, localDateKey, localToUtc, parseHM, slotFloor, slotLocalMinutes, weekdayOf } from "@/lib/time/slots";
import type { Assignment, Plan, PlannerState, StudySession } from "@/lib/types";

export const ANCHOR = "2026-11-09"; // a Monday

export function seedState(anchor = ANCHOR): { state: PlannerState; now: string } {
  const seed = createSeed(anchor);
  const zone = seed.settings.timezone;
  const busy = expandEvents(
    seed.events,
    { from: localToUtc(addDays(seed.anchor, -1), "00:00", zone), to: localToUtc(addDays(seed.anchor, 35), "00:00", zone) },
    zone,
  );
  return {
    now: seed.now,
    state: {
      settings: seed.settings,
      assignments: seed.assignments,
      subtasks: [],
      sessions: [],
      busy,
      plan_version: 1,
    },
  };
}

export const hours = (s: { start_at: string; end_at: string }) =>
  (Date.parse(s.end_at) - Date.parse(s.start_at)) / 3_600_000;

const overlaps = (a: { start_at: string; end_at: string }, b: { start_at: string; end_at: string }) =>
  Date.parse(a.start_at) < Date.parse(b.end_at) && Date.parse(b.start_at) < Date.parse(a.end_at);

const LEAD_HOURS: Record<Assignment["type"], number> = { assignment: 3, project: 6, exam: 12 };

/** Assert every hard limit. Returns a list of violations (empty = OK). */
export function violations(state: PlannerState, now: string, plan: Plan): string[] {
  const out: string[] = [];
  const { settings } = state;
  const zone = settings.timezone;
  const locked = state.sessions.filter((s) => s.status !== "cancelled" && s.status !== "missed");
  const all: StudySession[] = [...plan.sessions, ...locked];

  for (const s of plan.sessions) {
    const len = hours(s) * 60;
    if (len < settings.session_min) out.push(`${s.id} shorter than min (${len})`);
    if (len > settings.session_max) out.push(`${s.id} longer than max (${len})`);
    if (Date.parse(s.start_at) < Date.parse(now)) out.push(`${s.id} in the past`);

    for (const b of state.busy) if (overlaps(s, b)) out.push(`${s.id} overlaps event ${b.title}`);
    for (const l of locked) if (overlaps(s, l)) out.push(`${s.id} overlaps locked ${l.id}`);
    for (const o of plan.sessions) if (o.id !== s.id && overlaps(s, o)) out.push(`${s.id} overlaps ${o.id}`);

    const day = localDateKey(s.start_at, zone);
    if (settings.free_days.includes(weekdayOf(day))) out.push(`${s.id} on free day ${day}`);

    // Sleep window: (bed - wind_down) .. wake, may cross midnight.
    const sleepStart = (parseHM(settings.bed_time) - settings.wind_down_min + 1440) % 1440;
    const wake = parseHM(settings.wake_time);
    const inSleep = (m: number) => (sleepStart > wake ? m >= sleepStart || m < wake : m >= sleepStart && m < wake);
    for (let t = slotFloor(s.start_at); t < slotFloor(s.end_at); t++) {
      if (inSleep(slotLocalMinutes(t, zone))) {
        out.push(`${s.id} in sleep window`);
        break;
      }
    }

    const a = state.assignments.find((x) => x.id === s.assignment_id)!;
    const eff = Date.parse(a.due_at) - LEAD_HOURS[a.type] * 3_600_000;
    if (Date.parse(s.end_at) > eff) out.push(`${s.id} after effective deadline of ${a.id}`);
  }

  const perDay = new Map<string, number>();
  for (const s of all) {
    const d = localDateKey(s.start_at, zone);
    perDay.set(d, (perDay.get(d) ?? 0) + hours(s));
  }
  for (const [d, h] of perDay) if (h > settings.max_hours_per_day + 1e-9) out.push(`${d} has ${h} h > max`);
  return out;
}
