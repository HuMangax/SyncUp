import { describe, expect, it } from "vitest";
import { createSeed } from "@/lib/demo/seed";
import { expandEvents } from "@/lib/calendar/simulated";
import { validateMove } from "@/lib/calendar/move";
import { applyStepDone } from "@/lib/progress/remaining";
import { addDays, localToUtc } from "@/lib/time/slots";
import type { PlanData, StudySession, Subtask } from "@/lib/types";
import { ANCHOR } from "./helpers";

const seed = createSeed(ANCHOR);
const zone = seed.settings.timezone;
const day = (n: number, hm: string) => localToUtc(addDays(seed.anchor, n), hm, zone);

describe("steps drive progress", () => {
  const steps: Subtask[] = [
    { id: "s1", assignment_id: "a-marketing", title: "Outline", order_idx: 1, estimate_hours: 2, percent_complete: 0, source: "manual" },
    { id: "s2", assignment_id: "a-marketing", title: "Draft", order_idx: 2, estimate_hours: 6, percent_complete: 0, source: "manual" },
  ];
  const data = (): PlanData => ({ settings: seed.settings, assignments: seed.assignments, subtasks: steps, sessions: [], events: seed.events, planVersion: 1 });
  const pct = (d: PlanData) => d.assignments.find((a) => a.id === "a-marketing")!.percent_complete;

  it("weights by hours and can be undone", () => {
    const a = applyStepDone(data(), "s1", true);
    expect(pct(a)).toBe(25);
    const b = applyStepDone(a, "s2", true);
    expect(pct(b)).toBe(100);
    expect(b.assignments.find((x) => x.id === "a-marketing")!.status).toBe("completed");
    expect(pct(applyStepDone(b, "s2", false))).toBe(25);
  });
});

describe("cancelled occurrences", () => {
  it("drop out of busy time but can still be listed", () => {
    const range = { from: day(0, "00:00"), to: day(1, "00:00") };
    const lecture = seed.events.find((e) => e.id === "ev-mkt-lecture")!;
    const [first] = expandEvents([lecture], range, zone);
    const cancelled = { ...lecture, skip: [first.start_at] };
    expect(expandEvents([cancelled], range, zone)).toHaveLength(0);
    expect(expandEvents([cancelled], range, zone, { includeCancelled: true })[0].cancelled).toBe(true);
  });
});

describe("validateMove", () => {
  const session: StudySession = { id: "x", assignment_id: "a-marketing", subtask_id: null, start_at: day(3, "10:00"), end_at: day(3, "11:00"), status: "scheduled", minutes_done: 0, pinned: false, plan_version: 1 };
  const occurrences = expandEvents(seed.events, { from: day(0, "00:00"), to: day(8, "00:00") }, zone);
  const ctx = { now: seed.now, settings: seed.settings, occurrences, sessions: [session] };

  it("accepts a free slot", () => {
    expect(validateMove(session, day(3, "11:00"), ctx).ok).toBe(true);
  });
  it("refuses a clash with a lecture, sleep hours and too-soon times", () => {
    expect(validateMove(session, day(0, "09:30"), ctx).ok).toBe(false); // Monday lecture
    expect(validateMove(session, day(3, "03:00"), ctx).ok).toBe(false);
    expect(validateMove(session, new Date(Date.parse(seed.now) + 3_600_000).toISOString(), ctx).ok).toBe(false);
  });
});
