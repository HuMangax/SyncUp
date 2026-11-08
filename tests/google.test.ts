import { describe, expect, it } from "vitest";
import { GoogleCalendarProvider, LEGACY_PLANNER_CALENDAR, PLANNER_CALENDAR } from "@/lib/calendar/google";
import { decryptToken, encryptToken } from "@/lib/server/crypto";
import type { StudySession } from "@/lib/types";

type Call = { method: string; url: string; body?: unknown };

/** Minimal fake of the Google Calendar v3 API. */
function fakeGoogle(opts: { hasPlannerCalendar?: boolean; calendarName?: string } = {}) {
  const calls: Call[] = [];
  const events: Record<string, Record<string, unknown>> = {
    "ours-1": { id: "ours-1", extendedProperties: { private: { plannerSession: "1", sessionId: "s-1" } } },
    "theirs-1": { id: "theirs-1", summary: "Dentist" },
  };
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/users/me/calendarList")) {
      return json({ items: opts.hasPlannerCalendar ? [{ id: "planner-cal", summary: opts.calendarName ?? PLANNER_CALENDAR }] : [{ id: "primary", summary: "Me" }] });
    }
    if (url.endsWith("/calendars") && method === "POST") return json({ id: "planner-cal", summary: PLANNER_CALENDAR });
    if (url.includes("/calendars/primary/events") && method === "GET") {
      return json({
        items: [
          { id: "a", status: "confirmed", summary: "Lecture", start: { dateTime: "2026-11-09T17:00:00Z" }, end: { dateTime: "2026-11-09T18:30:00Z" } },
          { id: "b", status: "cancelled", summary: "Gone", start: { dateTime: "2026-11-09T19:00:00Z" }, end: { dateTime: "2026-11-09T20:00:00Z" } },
          { id: "c", status: "confirmed", summary: "Free time", transparency: "transparent", start: { dateTime: "2026-11-09T21:00:00Z" }, end: { dateTime: "2026-11-09T22:00:00Z" } },
          { id: "d", status: "confirmed", summary: "Holiday", start: { date: "2026-11-11" }, end: { date: "2026-11-12" } },
          { id: "e", status: "confirmed", summary: "Study", start: { dateTime: "2026-11-10T02:00:00Z" }, end: { dateTime: "2026-11-10T03:00:00Z" }, extendedProperties: { private: { plannerSession: "1" } } },
        ],
      });
    }
    const m = url.match(/\/calendars\/planner-cal\/events\/([^?]+)/);
    if (m) {
      const ev = events[decodeURIComponent(m[1])];
      if (!ev) return json({ error: "not found" }, 404);
      if (method === "GET") return json(ev);
      if (method === "PATCH") return json({ ...ev, ...body });
      if (method === "DELETE") return new Response(null, { status: 204 });
    }
    if (url.includes("/calendars/planner-cal/events") && method === "POST") return json({ id: "new-1", ...body });
    return json({ error: `unexpected ${method} ${url}` }, 500);
  };
  return { calls, fetchImpl: fetchImpl as typeof fetch };
}

const session: StudySession = {
  id: "s-9", assignment_id: "a-marketing", subtask_id: null,
  start_at: "2026-11-10T02:00:00.000Z", end_at: "2026-11-10T03:30:00.000Z",
  status: "scheduled", minutes_done: 0, pinned: false, plan_version: 2,
};

describe("GoogleCalendarProvider", () => {
  it("lists only busy, timed, confirmed events and excludes our own study sessions", async () => {
    const g = fakeGoogle();
    const p = new GoogleCalendarProvider("token", "America/Vancouver", g.fetchImpl);
    const occ = await p.listEvents({ from: "2026-11-09T00:00:00Z", to: "2026-11-16T00:00:00Z" });
    expect(occ.map((o) => o.title)).toEqual(["Lecture"]);
    expect(occ[0]).toMatchObject({ start_at: "2026-11-09T17:00:00.000Z", end_at: "2026-11-09T18:30:00.000Z" });
    expect(g.calls.every((c) => c.method === "GET")).toBe(true); // reading never writes
  });

  it("creates the SyncUp calendar if needed and tags new sessions", async () => {
    const g = fakeGoogle({ hasPlannerCalendar: false });
    const p = new GoogleCalendarProvider("token", "America/Vancouver", g.fetchImpl);
    const { externalId } = await p.upsertSession(session);
    expect(externalId).toBe("new-1");
    const create = g.calls.find((c) => c.method === "POST" && c.url.endsWith("/calendars"));
    expect(create?.body).toMatchObject({ summary: PLANNER_CALENDAR });
    const insert = g.calls.find((c) => c.method === "POST" && c.url.includes("/planner-cal/events"));
    expect(insert?.body).toMatchObject({ extendedProperties: { private: { plannerSession: "1", sessionId: "s-9" } } });
    expect(g.calls.some((c) => c.url.includes("/calendars/primary/") && c.method !== "GET")).toBe(false);
  });

  it("reuses a calendar made before the SyncUp rename instead of creating a second one", async () => {
    const g = fakeGoogle({ hasPlannerCalendar: true, calendarName: LEGACY_PLANNER_CALENDAR });
    const p = new GoogleCalendarProvider("token", "America/Vancouver", g.fetchImpl);
    await p.upsertSession(session);
    expect(g.calls.some((c) => c.method === "POST" && c.url.endsWith("/calendars"))).toBe(false);
    expect(g.calls.some((c) => c.method === "POST" && c.url.includes("/planner-cal/events"))).toBe(true);
  });

  it("updates a tagged event in place", async () => {
    const g = fakeGoogle({ hasPlannerCalendar: true });
    const p = new GoogleCalendarProvider("token", "America/Vancouver", g.fetchImpl);
    await p.upsertSession({ ...session, id: "s-1", external_id: "ours-1" });
    expect(g.calls.some((c) => c.method === "PATCH" && c.url.includes("ours-1"))).toBe(true);
  });

  it("refuses to modify or delete an event it did not create", async () => {
    const g = fakeGoogle({ hasPlannerCalendar: true });
    const p = new GoogleCalendarProvider("token", "America/Vancouver", g.fetchImpl);
    await expect(p.upsertSession({ ...session, external_id: "theirs-1" })).rejects.toThrow(/not created by the planner/);
    await expect(p.removeSession("theirs-1")).rejects.toThrow(/not created by the planner/);
    expect(g.calls.some((c) => c.method === "PATCH" || c.method === "DELETE")).toBe(false);
  });

  it("deletes its own tagged event", async () => {
    const g = fakeGoogle({ hasPlannerCalendar: true });
    const p = new GoogleCalendarProvider("token", "America/Vancouver", g.fetchImpl);
    await p.removeSession("ours-1");
    expect(g.calls.some((c) => c.method === "DELETE" && c.url.includes("ours-1"))).toBe(true);
  });
});

describe("token encryption", () => {
  it("round-trips and rejects tampering or the wrong secret", () => {
    const sealed = encryptToken("refresh-abc", "secret-1");
    expect(sealed).not.toContain("refresh-abc");
    expect(decryptToken(sealed, "secret-1")).toBe("refresh-abc");
    expect(decryptToken(sealed, "secret-2")).toBeNull();
    expect(decryptToken(sealed.slice(0, -2) + "AA", "secret-1")).toBeNull();
  });
});
