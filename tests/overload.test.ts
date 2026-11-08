import { describe, expect, it } from "vitest";
import { createSeed } from "@/lib/demo/seed";
import { detectOverload } from "@/lib/feasibility/overload";
import type { PlanData } from "@/lib/types";
import { ANCHOR } from "./helpers";

const seed = createSeed(ANCHOR);
const data = (over: Partial<PlanData> = {}): PlanData => ({
  settings: seed.settings,
  assignments: seed.assignments,
  subtasks: [],
  sessions: [],
  events: seed.events,
  planVersion: 1,
  ...over,
});

describe("detectOverload", () => {
  it("is deterministic", () => {
    expect(detectOverload(data(), seed.now)).toEqual(detectOverload(data(), seed.now));
  });

  it("flags more work than time, with numbers and what-ifs", () => {
    const tight = { ...seed.settings, max_hours_per_day: 1 };
    const o = detectOverload(data({ settings: tight }), seed.now);
    expect(o?.level).toBe("over");
    expect(o!.needed_hours).toBeGreaterThan(o!.available_hours);
    expect(o!.short_hours).toBeCloseTo(o!.needed_hours - o!.available_hours, 0);
    expect(o!.assignment_ids.length).toBeGreaterThan(0);
  });

  it("stays quiet when there is plenty of time", () => {
    const light = seed.assignments.map((a) => ({ ...a, estimate_hours: 1 }));
    const roomy = { ...seed.settings, max_hours_per_day: 8 };
    expect(detectOverload(data({ assignments: light, settings: roomy }), seed.now)).toBeNull();
  });
});
