import { describe, expect, it } from "vitest";
import { expandEvents } from "@/lib/calendar/simulated";
import { createSeed, demoAnchorFor, DEMO_ZONE } from "@/lib/demo/seed";
import { formatLocal, localDateKey, localToUtc, slotCeil, slotFloor, slotToIso } from "@/lib/time/slots";
import type { CalendarEvent } from "@/lib/types";

const lecture: CalendarEvent = {
  id: "c", source: "simulated", title: "Class", kind: "class", read_only: true,
  start_at: "2026-10-26T16:00:00.000Z", end_at: "2026-10-26T17:30:00.000Z",
  rule: { days: [1, 2, 3, 4, 5], start: "09:00", end: "10:30" },
};

describe("slot grid", () => {
  it("floors and ceils to 15 minutes", () => {
    expect(slotToIso(slotFloor("2026-11-09T16:07:00.000Z"))).toBe("2026-11-09T16:00:00.000Z");
    expect(slotToIso(slotCeil("2026-11-09T16:07:00.000Z"))).toBe("2026-11-09T16:15:00.000Z");
  });
});

describe("recurrence across DST", () => {
  it("keeps a 9:00 class at 9:00 local on Nov 1, 2026 and Mar 14, 2027", () => {
    // US DST ends Sun Nov 1 2026; starts Sun Mar 14 2027.
    for (const [from, to, days] of [
      ["2026-10-30T00:00:00Z", "2026-11-04T00:00:00Z", 3],
      ["2027-03-11T00:00:00Z", "2027-03-17T00:00:00Z", 4],
    ] as const) {
      const occ = expandEvents([lecture], { from, to }, DEMO_ZONE);
      expect(occ.length).toBeGreaterThanOrEqual(days);
      for (const o of occ) expect(formatLocal(o.start_at, DEMO_ZONE, "HH:mm")).toBe("09:00");
    }
  });
  it("UTC offset differs across the change (so the test is meaningful)", () => {
    expect(localToUtc("2026-10-30", "09:00", DEMO_ZONE)).toBe("2026-10-30T16:00:00.000Z");
    expect(localToUtc("2026-11-02", "09:00", DEMO_ZONE)).toBe("2026-11-02T17:00:00.000Z");
  });
});

describe("seed", () => {
  it("anchors to the coming Monday and uses only offsets", () => {
    expect(demoAnchorFor("2026-11-07T20:00:00Z")).toBe("2026-11-09");
    const seed = createSeed("2026-11-09");
    expect(seed.assignments.map((a) => localDateKey(a.due_at, DEMO_ZONE))).toEqual(["2026-11-20", "2026-11-23", "2026-11-25"]);
    expect(localDateKey(createSeed("2027-01-04").assignments[0].due_at, DEMO_ZONE)).toBe("2027-01-15");
  });
});
