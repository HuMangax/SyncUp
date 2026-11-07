import { describe, expect, it } from "vitest";
import { markNextMissed, squeezeWeek, surpriseShift } from "@/lib/demo/controls";
import { buildProposal, generateInitial } from "@/lib/progress/proposal";
import { localDateKey, weekdayOf } from "@/lib/time/slots";
import { seedData } from "./helpers";

describe("demo controls", () => {
  it("opening plan has no deadline risk", () => {
    const { data, now } = seedData();
    const g = generateInitial(data, now);
    expect(g.warnings.filter((w) => w.severity === "red")).toEqual([]);
  });

  it("Squeeze week produces a red deadline warning", () => {
    const { data, now } = seedData();
    const d = squeezeWeek(generateInitial(data, now).data, now);
    const p = buildProposal(d, now, { type: "calendar_change" }, "p-1");
    expect(p.warnings.some((w) => w.kind === "deadline_risk" && w.severity === "red" && w.hours_short > 0)).toBe(true);
  });

  it("Surprise shift adds a read-only 6 h work event on Thursday", () => {
    const { data, now } = seedData();
    const d = surpriseShift(data, now);
    const ev = d.events.find((e) => !data.events.some((x) => x.id === e.id))!;
    expect(ev.kind).toBe("work");
    expect(ev.read_only).toBe(true);
    expect((Date.parse(ev.end_at) - Date.parse(ev.start_at)) / 3_600_000).toBe(6);
    expect(weekdayOf(localDateKey(ev.start_at, data.settings.timezone))).toBe(4);
  });

  it("Mark next session missed advances the clock past it and marks it missed", () => {
    const { data, now } = seedData();
    const planned = generateInitial(data, now).data;
    const r = markNextMissed(planned, now)!;
    const s = r.data.sessions.find((x) => x.id === r.sessionId)!;
    expect(s.status).toBe("missed");
    expect(Date.parse(r.now)).toBeGreaterThanOrEqual(Date.parse(s.end_at));
  });
});
