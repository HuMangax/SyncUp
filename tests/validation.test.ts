import { describe, expect, it } from "vitest";
import { assignmentFromInput, AssignmentInput, SettingsInput, parseImportedState, eventFromInput } from "@/lib/validation";
import { formatLocal, localDateKey } from "@/lib/time/slots";
import { seedData } from "./helpers";

const ZONE = "America/Vancouver";
const valid = {
  title: "Lab report",
  course: "CHEM 121",
  type: "assignment",
  due_local: "2026-11-18T17:00",
  estimate_hours: 4,
  difficulty: 2,
  priority: 1,
  description: "",
  ai_enabled: null,
};

describe("assignment input", () => {
  it("accepts a valid assignment and converts the local due time to UTC", () => {
    const a = assignmentFromInput(AssignmentInput.parse(valid), ZONE, "a-new");
    expect(a.due_at).toBe("2026-11-19T01:00:00.000Z");
    expect(formatLocal(a.due_at, ZONE, "HH:mm")).toBe("17:00");
    expect(a).toMatchObject({ id: "a-new", percent_complete: 0, remaining_override: null, status: "active" });
  });
  it("rejects an empty title, zero hours and an unknown type", () => {
    expect(AssignmentInput.safeParse({ ...valid, title: " " }).success).toBe(false);
    expect(AssignmentInput.safeParse({ ...valid, estimate_hours: 0 }).success).toBe(false);
    expect(AssignmentInput.safeParse({ ...valid, type: "essay" }).success).toBe(false);
  });
  it("keeps progress when editing an existing assignment", () => {
    const { data } = seedData();
    const old = { ...data.assignments[0], percent_complete: 40 };
    const a = assignmentFromInput(AssignmentInput.parse({ ...valid, estimate_hours: 10 }), ZONE, old.id, old);
    expect(a.percent_complete).toBe(40);
    expect(a.estimate_hours).toBe(10);
  });
});

describe("settings input", () => {
  const s = seedData().data.settings;
  it("accepts the seed settings", () => expect(SettingsInput.safeParse(s).success).toBe(true));
  it("rejects min > max session length and identical bed/wake times", () => {
    expect(SettingsInput.safeParse({ ...s, session_min: 150, session_max: 120 }).success).toBe(false);
    expect(SettingsInput.safeParse({ ...s, bed_time: "07:30", wake_time: "07:30" }).success).toBe(false);
  });
  it("rejects a daily max outside 0.5-16 h and every day free", () => {
    expect(SettingsInput.safeParse({ ...s, max_hours_per_day: 0 }).success).toBe(false);
    expect(SettingsInput.safeParse({ ...s, free_days: [0, 1, 2, 3, 4, 5, 6] }).success).toBe(false);
  });
});

describe("calendar event input", () => {
  it("builds a one-off event in local time", () => {
    const e = eventFromInput({ title: "Dentist", kind: "other", date: "2026-11-12", start: "15:00", end: "16:00", weekly: false }, ZONE, "ev-user-1");
    expect(localDateKey(e.start_at, ZONE)).toBe("2026-11-12");
    expect(formatLocal(e.start_at, ZONE, "HH:mm")).toBe("15:00");
    expect(e.rule).toBeUndefined();
    expect(e.read_only).toBe(true);
  });
  it("builds a weekly event on that weekday", () => {
    const e = eventFromInput({ title: "Gym", kind: "social", date: "2026-11-12", start: "07:00", end: "08:00", weekly: true }, ZONE, "ev-user-2");
    expect(e.rule?.days).toEqual([4]);
  });
});

describe("import", () => {
  it("round-trips an exported state", () => {
    const { data, now } = seedData();
    const json = JSON.stringify({ version: 1, now, anchor: "2026-11-09", ...data });
    const r = parseImportedState(json);
    expect(r.ok).toBe(true);
  });
  it("rejects malformed JSON and wrong shapes with a message", () => {
    expect(parseImportedState("{nope").ok).toBe(false);
    const r = parseImportedState(JSON.stringify({ version: 1, assignments: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });
});
