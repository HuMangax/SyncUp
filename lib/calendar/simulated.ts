import type { CalendarEvent, EventOccurrence, ISO, StudySession } from "@/lib/types";
import { addDays, localDateKey, localToUtc, weekdayOf } from "@/lib/time/slots";
import type { CalendarProvider, DateRange } from "./provider";

/**
 * Expand events into concrete occurrences within [from, to).
 * Weekly rules are expanded by LOCAL wall-clock time and then converted to UTC,
 * so a 9:00 class stays 9:00 across DST changes.
 */
export function expandEvents(
  events: CalendarEvent[],
  range: DateRange,
  zone: string,
  opts: { includeCancelled?: boolean } = {},
): EventOccurrence[] {
  const fromMs = Date.parse(range.from);
  const toMs = Date.parse(range.to);
  const out: EventOccurrence[] = [];

  for (const ev of events) {
    const skipped = new Set(ev.skip ?? []);
    const add = (o: EventOccurrence) => {
      if (!skipped.has(o.start_at)) out.push(o);
      else if (opts.includeCancelled) out.push({ ...o, cancelled: true });
    };
    if (!ev.rule) {
      const s = Date.parse(ev.start_at);
      const e = Date.parse(ev.end_at);
      if (e > fromMs && s < toMs) {
        add({ event_id: ev.id, title: ev.title, kind: ev.kind, start_at: ev.start_at, end_at: ev.end_at });
      }
      continue;
    }
    const rule = ev.rule;
    // Start a day early so an occurrence spanning midnight into the range is not missed.
    let day = addDays(localDateKey(range.from, zone), -1);
    const lastDay = localDateKey(range.to, zone);
    while (day <= lastDay) {
      const inBounds = (!rule.from || day >= rule.from) && (!rule.until || day <= rule.until);
      if (inBounds && rule.days.includes(weekdayOf(day))) {
        const start_at = localToUtc(day, rule.start, zone);
        let end_at = localToUtc(day, rule.end, zone);
        if (Date.parse(end_at) <= Date.parse(start_at)) {
          end_at = localToUtc(addDays(day, 1), rule.end, zone); // crosses midnight
        }
        if (Date.parse(end_at) > fromMs && Date.parse(start_at) < toMs) {
          add({ event_id: ev.id, title: ev.title, kind: ev.kind, start_at, end_at });
        }
      }
      day = addDays(day, 1);
    }
  }
  return out.sort(
    (a, b) => a.start_at.localeCompare(b.start_at) || a.event_id.localeCompare(b.event_id),
  );
}

/** In-memory provider backed by seeded events. Works with no network. */
export class SimulatedCalendarProvider implements CalendarProvider {
  private ours = new Map<string, StudySession>();

  constructor(
    private events: CalendarEvent[],
    private zone: string,
  ) {}

  setEvents(events: CalendarEvent[]) {
    this.events = events;
  }

  async listEvents(range: DateRange): Promise<EventOccurrence[]> {
    return expandEvents(this.events, range, this.zone);
  }

  async upsertSession(s: StudySession): Promise<{ externalId: string }> {
    const externalId = s.external_id ?? `sim-${s.id}`;
    this.ours.set(externalId, s);
    return { externalId };
  }

  async removeSession(externalId: string): Promise<void> {
    this.ours.delete(externalId);
  }
}

/** Convenience used by tests and the store. */
export const rangeOf = (from: ISO, to: ISO): DateRange => ({ from, to });
