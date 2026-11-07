import type { CalendarEvent, EventOccurrence, ISO, StudySession } from "@/lib/types";

export type DateRange = { from: ISO; to: ISO };

/**
 * Swappable calendar backend. The scheduler never touches this: it only receives
 * the expanded busy intervals that `listEvents` returns.
 */
export interface CalendarProvider {
  /** Read-only, recurrences already expanded. Never includes our own study sessions. */
  listEvents(range: DateRange): Promise<EventOccurrence[]>;
  /** Create or update one of OUR events. Never touches events we did not create. */
  upsertSession(s: StudySession): Promise<{ externalId: string }>;
  /** Remove one of OUR events. */
  removeSession(externalId: string): Promise<void>;
}

export type { CalendarEvent };
