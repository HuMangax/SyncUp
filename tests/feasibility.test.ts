import { describe, expect, it } from "vitest";
import { checkFeasibility } from "@/lib/feasibility/check";
import { schedule } from "@/lib/scheduler";
import { localToUtc, addDays } from "@/lib/time/slots";
import type { PlannerState } from "@/lib/types";
import { ANCHOR, seedState } from "./helpers";

describe("feasibility", () => {
  it("the opening demo plan has no deadline risk", () => {
    const { state, now } = seedState();
    const { warnings, risk } = checkFeasibility(state, now, schedule(state, now));
    expect(warnings.filter((w) => w.severity === "red")).toEqual([]);
    expect(risk.every((r) => r.level !== "at_risk")).toBe(true);
    expect(risk.map((r) => r.assignment_id).sort()).toEqual(["a-marketing", "a-operations", "a-stats"]);
  });

  it("an infeasible week gives a red warning naming the assignment and hours short", () => {
    const { state, now } = seedState();
    const s: PlannerState = { ...state, settings: { ...state.settings, max_hours_per_day: 1 } };
    const plan = schedule(s, now);
    const { warnings, risk } = checkFeasibility(s, now, plan);
    const red = warnings.filter((w) => w.kind === "deadline_risk");
    expect(red.length).toBeGreaterThan(0);
    for (const w of red) {
      expect(w.severity).toBe("red");
      expect(w.hours_short).toBeCloseTo(plan.unplaced[w.assignment_id!]);
      const title = s.assignments.find((a) => a.id === w.assignment_id)!.title;
      expect(w.message).toContain(title);
      expect(risk.find((r) => r.assignment_id === w.assignment_id)!.level).toBe("at_risk");
    }
  });

  it("red warnings carry what-if suggestions that recover hours", () => {
    const { state, now } = seedState();
    const s: PlannerState = { ...state, settings: { ...state.settings, max_hours_per_day: 1.5 } };
    const { warnings } = checkFeasibility(s, now, schedule(s, now));
    const sugg = warnings.find((w) => w.kind === "deadline_risk")!.suggestions;
    const raise = sugg.find((x) => x.action.type === "raise_max_hours");
    expect(raise).toBeDefined();
    expect(raise!.recovers_hours).toBeGreaterThan(0);
    expect(raise!.recovers_hours).toBeLessThanOrEqual(raise!.of_hours);
    for (const x of sugg) expect(x.recovers_hours).toBeGreaterThan(0);
  });

  it("flags two deadlines within 48 h as an overlap", () => {
    const { state, now } = seedState();
    const zone = state.settings.timezone;
    const s: PlannerState = {
      ...state,
      assignments: state.assignments.map((a) => (a.id === "a-operations" ? { ...a, due_at: localToUtc(addDays(ANCHOR, 12), "17:00", zone) } : a)),
    };
    const { warnings } = checkFeasibility(s, now, schedule(s, now));
    expect(warnings.some((w) => w.kind === "overlap" && w.severity === "yellow")).toBe(true);
  });

  it("flags a day planned at 90%+ of the daily max", () => {
    const { state, now } = seedState();
    const plan = schedule(state, now);
    const { warnings } = checkFeasibility(state, now, {
      ...plan,
      loadByDay: [{ day: ANCHOR, planned_hours: 5.5, capacity_hours: 6 }],
    });
    expect(warnings.some((w) => w.kind === "overloaded_day" && w.day === ANCHOR)).toBe(true);
  });

  it("folds many overloaded days into one warning", () => {
    const { state, now } = seedState();
    const plan = schedule(state, now);
    const loadByDay = [0, 1, 2].map((i) => ({ day: addDays(ANCHOR, i), planned_hours: 5.5, capacity_hours: 6 }));
    const { warnings } = checkFeasibility(state, now, { ...plan, loadByDay });
    const ov = warnings.filter((w) => w.kind === "overloaded_day");
    expect(ov).toHaveLength(1);
    expect(ov[0].message).toContain("3 days");
  });
});
