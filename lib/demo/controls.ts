import type { CalendarEvent, PlanData } from "@/lib/types";
import { applySessionStatus } from "@/lib/progress/remaining";
import { addDays, localDateKey, localToUtc, weekdayOf } from "@/lib/time/slots";

/**
 * Demo controls. Pure functions over PlanData that call the same logic as the UI.
 * No demo-only scheduling behavior: the store turns each result into a normal proposal.
 */

const nextWeekday = (todayKey: string, weekday: number) => addDays(todayKey, (weekday - weekdayOf(todayKey) + 7) % 7);
const newId = (data: PlanData, prefix: string) => {
  let i = 1;
  while (data.events.some((e) => e.id === `${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
};

/** Surprise shift: a 6 h work event on the coming Thursday (10:00 to 16:00). */
export function surpriseShift(data: PlanData, now: string): PlanData {
  const zone = data.settings.timezone;
  let day = nextWeekday(localDateKey(now, zone), 4);
  if (Date.parse(localToUtc(day, "10:00", zone)) <= Date.parse(now)) day = addDays(day, 7);
  const ev: CalendarEvent = {
    id: newId(data, "ev-surprise"),
    source: "simulated",
    title: "Extra shift",
    kind: "work",
    start_at: localToUtc(day, "10:00", zone),
    end_at: localToUtc(day, "16:00", zone),
    read_only: true,
  };
  return { ...data, events: [...data.events, ev] };
}

/** Squeeze week: daily max drops to 1.5 h and evening shifts appear on Wed and Fri for two weeks. */
export function squeezeWeek(data: PlanData, now: string): PlanData {
  const zone = data.settings.timezone;
  const today = localDateKey(now, zone);
  const ev: CalendarEvent = {
    id: newId(data, "ev-squeeze"),
    source: "simulated",
    title: "Extra evening shift",
    kind: "work",
    start_at: localToUtc(nextWeekday(today, 3), "17:00", zone),
    end_at: localToUtc(nextWeekday(today, 3), "22:00", zone),
    rule: { days: [3, 5], start: "17:00", end: "22:00", from: today, until: addDays(today, 13) },
    read_only: true,
  };
  return {
    ...data,
    settings: { ...data.settings, max_hours_per_day: Math.min(data.settings.max_hours_per_day, 1.5) },
    events: [...data.events, ev],
  };
}

/** Mark the next scheduled session missed, advancing the clock to its end if needed. */
export function markNextMissed(data: PlanData, now: string): { data: PlanData; now: string; sessionId: string } | null {
  const next = data.sessions
    .filter((s) => s.status === "scheduled" && Date.parse(s.end_at) > Date.parse(now))
    .sort((a, b) => a.start_at.localeCompare(b.start_at) || a.id.localeCompare(b.id))[0];
  if (!next) return null;
  const at = Date.parse(next.end_at) > Date.parse(now) ? next.end_at : now;
  return { data: applySessionStatus(data, next.id, "missed"), now: at, sessionId: next.id };
}
