import { describe, expect, it, vi } from "vitest";
import { breakdown, BreakdownRequest, normalize, templateBreakdown } from "@/lib/ai/breakdown";

const req = BreakdownRequest.parse({ title: "Lab report", course: "CHEM 121", type: "assignment", description: "Write up titration lab", estimateHours: 6 });
const good = JSON.stringify({
  subtasks: [
    { title: "Review data", description: "", estimateHours: 1, order: 1 },
    { title: "Draft methods and results", description: "", estimateHours: 2.5, order: 2 },
    { title: "Discussion", description: "", estimateHours: 1.5, order: 3 },
    { title: "Proofread", description: "", estimateHours: 1, order: 4 },
  ],
  assumptions: ["Data is already collected"],
});
const sum = (r: { subtasks: { estimateHours: number }[] }) => r.subtasks.reduce((a, b) => a + b.estimateHours, 0);

describe("template fallback", () => {
  it("assignment: Research 25 / Outline 10 / Draft 35 / Editing 20 / Review 10", () => {
    const t = templateBreakdown("assignment", 10);
    expect(t.subtasks.map((s) => s.title)).toEqual(["Research", "Outline", "First draft", "Editing", "Final review"]);
    expect(t.source).toBe("template");
    expect(sum(t)).toBeCloseTo(10, 0);
  });
  it("exam: Review notes / Practice problems / Weak topics / Mock exam", () => {
    expect(templateBreakdown("exam", 12).subtasks.map((s) => s.title)).toEqual(["Review notes", "Practice problems", "Weak topics", "Mock exam"]);
  });
});

describe("normalize", () => {
  it("clamps hours to 0.5-6 in 0.5 steps and renumbers order", () => {
    const r = normalize(
      {
        subtasks: [
          { title: "A", description: "", estimateHours: 0.1, order: 5 },
          { title: "B", description: "", estimateHours: 9, order: 2 },
          { title: "C", description: "", estimateHours: 1.3, order: 9 },
        ],
        assumptions: [],
      },
      undefined,
    );
    expect(r.subtasks.map((s) => s.title)).toEqual(["B", "A", "C"]);
    expect(r.subtasks.map((s) => s.estimateHours)).toEqual([6, 0.5, 1.5]);
    expect(r.subtasks.map((s) => s.order)).toEqual([1, 2, 3]);
  });
  it("rejects fewer than 3 or more than 8 subtasks", () => {
    const one = { subtasks: [{ title: "A", description: "", estimateHours: 1, order: 1 }], assumptions: [] };
    expect(() => normalize(one, 4)).toThrow(/3 to 8/);
  });
  it("scales and flags a total more than 25% off the student's estimate", () => {
    const r = normalize(JSON.parse(good), 12); // AI total 6 vs 12
    expect(sum(r)).toBeGreaterThanOrEqual(12 * 0.75);
    expect(r.assumptions.some((a) => /scaled/i.test(a))).toBe(true);
  });
});

describe("breakdown()", () => {
  it("uses valid AI output", async () => {
    const r = await breakdown(req, { callModel: async () => good });
    expect(r.source).toBe("ai");
    expect(r.subtasks).toHaveLength(4);
  });
  it("invalid JSON twice falls back to the template, retrying once with the error", async () => {
    const call = vi.fn<(retryNote?: string) => Promise<string>>(async () => "{not json");
    const r = await breakdown(req, { callModel: call });
    expect(r.source).toBe("template");
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0]).toMatch(/JSON/);
  });
  it("retry succeeds after a validation error", async () => {
    const call = vi.fn<(retryNote?: string) => Promise<string>>()
      .mockResolvedValueOnce(JSON.stringify({ subtasks: [], assumptions: [] }))
      .mockResolvedValueOnce(good);
    const r = await breakdown(req, { callModel: call });
    expect(r.source).toBe("ai");
    expect(call.mock.calls[1][0]).toMatch(/3 to 8/);
  });
  it("a timeout gives the template", async () => {
    const r = await breakdown(req, { callModel: () => new Promise<string>(() => {}), timeoutMs: 20 });
    expect(r.source).toBe("template");
  });
  it("an API error gives the template", async () => {
    const r = await breakdown(req, {
      callModel: async () => {
        throw new Error("boom");
      },
    });
    expect(r.source).toBe("template");
  });
  it("no key (no model) or AI off gives the template without calling", async () => {
    const call = vi.fn(async () => good);
    expect((await breakdown(req, {})).source).toBe("template");
    expect((await breakdown({ ...req, useAi: false }, { callModel: call })).source).toBe("template");
    expect(call).not.toHaveBeenCalled();
  });
  it("demo assignments are served from the cache with no call", async () => {
    const call = vi.fn(async () => good);
    const r = await breakdown(
      BreakdownRequest.parse({ title: "Marketing paper", course: "MKTG 301", type: "assignment", description: "", estimateHours: 8 }),
      { callModel: call },
    );
    expect(r.source).toBe("cache");
    expect(call).not.toHaveBeenCalled();
    expect(r.subtasks.length).toBeGreaterThanOrEqual(3);
  });
  it("never returns dates or times", async () => {
    const r = await breakdown(req, { callModel: async () => good });
    expect(JSON.stringify(r)).not.toMatch(/\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}/);
  });
});

describe("request validation", () => {
  it("caps the description at 8000 chars and requires a title", () => {
    expect(BreakdownRequest.safeParse({ ...req, description: "x".repeat(8001) }).success).toBe(false);
    expect(BreakdownRequest.safeParse({ ...req, title: "" }).success).toBe(false);
  });
});

import { createRateLimiter } from "@/lib/ai/rateLimit";
describe("rate limit", () => {
  it("allows N per window per key, then blocks until the window resets", () => {
    const ok = createRateLimiter(2, 1000);
    expect([ok("a", 0), ok("a", 10), ok("a", 20), ok("b", 20)]).toEqual([true, true, false, true]);
    expect(ok("a", 1001)).toBe(true);
  });
});
