import type { EventOccurrence, StudySession } from "@/lib/types";
import type { CalendarProvider, DateRange } from "./provider";

/**
 * Google Calendar provider (server-side; needs an OAuth access token).
 * - Reads busy events from the primary calendar. Never writes to it.
 * - Writes study sessions only into a dedicated "SyncUp" calendar, tagged with
 *   extendedProperties.private.plannerSession = "1" and the session id.
 * - Refuses to modify or delete any event that does not carry that tag.
 */
export const PLANNER_CALENDAR = "SyncUp";
/** Name used before the rename. Still recognised so existing users keep one calendar. */
export const LEGACY_PLANNER_CALENDAR = "Study Planner";
const API = "https://www.googleapis.com/calendar/v3";

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

const isOurs = (e: GEvent) => e.extendedProperties?.private?.plannerSession === "1";

export class NotOurEventError extends Error {
  constructor(id: string) {
    super(`Event ${id} was not created by the planner; refusing to change it.`);
  }
}

export class GoogleCalendarProvider implements CalendarProvider {
  private plannerCalendarId: string | null = null;

  constructor(
    private accessToken: string,
    private timeZone: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Google Calendar ${init.method ?? "GET"} ${path} failed: ${res.status}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  /** Busy, timed, confirmed events. All-day and "free" events don't block time; our own sessions are excluded. */
  async listEvents(range: DateRange): Promise<EventOccurrence[]> {
    const out: EventOccurrence[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({
        timeMin: new Date(range.from).toISOString(),
        timeMax: new Date(range.to).toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
        ...(pageToken ? { pageToken } : {}),
      });
      const page = await this.call<{ items?: GEvent[]; nextPageToken?: string }>(`/calendars/primary/events?${q}`);
      for (const e of page.items ?? []) {
        if (e.status === "cancelled" || e.transparency === "transparent" || isOurs(e)) continue;
        if (!e.start?.dateTime || !e.end?.dateTime) continue; // all-day
        out.push({
          event_id: `g-${e.id}`,
          title: e.summary || "Busy",
          kind: "other",
          start_at: new Date(e.start.dateTime).toISOString(),
          end_at: new Date(e.end.dateTime).toISOString(),
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  private async plannerCalendar(): Promise<string> {
    if (this.plannerCalendarId) return this.plannerCalendarId;
    const list = await this.call<{ items?: { id: string; summary: string }[] }>("/users/me/calendarList");
    const found =
      list.items?.find((c) => c.summary === PLANNER_CALENDAR) ?? list.items?.find((c) => c.summary === LEGACY_PLANNER_CALENDAR);
    this.plannerCalendarId = found
      ? found.id
      : (await this.call<{ id: string }>("/calendars", { method: "POST", body: JSON.stringify({ summary: PLANNER_CALENDAR, timeZone: this.timeZone }) })).id;
    return this.plannerCalendarId;
  }

  private async getOurs(calId: string, externalId: string): Promise<GEvent> {
    const ev = await this.call<GEvent>(`/calendars/${calId}/events/${encodeURIComponent(externalId)}`);
    if (!isOurs(ev)) throw new NotOurEventError(externalId);
    return ev;
  }

  async upsertSession(s: StudySession): Promise<{ externalId: string }> {
    const calId = await this.plannerCalendar();
    const body = {
      summary: "Study session",
      start: { dateTime: s.start_at, timeZone: this.timeZone },
      end: { dateTime: s.end_at, timeZone: this.timeZone },
      extendedProperties: { private: { plannerSession: "1", sessionId: s.id } },
    };
    if (s.external_id) {
      await this.getOurs(calId, s.external_id);
      const ev = await this.call<GEvent>(`/calendars/${calId}/events/${encodeURIComponent(s.external_id)}`, { method: "PATCH", body: JSON.stringify(body) });
      return { externalId: ev.id };
    }
    const ev = await this.call<GEvent>(`/calendars/${calId}/events`, { method: "POST", body: JSON.stringify(body) });
    return { externalId: ev.id };
  }

  async removeSession(externalId: string): Promise<void> {
    const calId = await this.plannerCalendar();
    await this.getOurs(calId, externalId);
    await this.call(`/calendars/${calId}/events/${encodeURIComponent(externalId)}`, { method: "DELETE" });
  }
}
