import { describe, expect, it } from "vitest";
import { fromRows, toRows } from "@/lib/repo/rows";
import { generateInitial } from "@/lib/progress/proposal";
import { seedData } from "./helpers";

describe("Supabase row mapping", () => {
  it("round-trips the stored state and stamps every row with the user id", () => {
    const { data, now } = seedData();
    const planned = { ...generateInitial(data, now).data, subtasks: [{ id: "st-1", assignment_id: "a-marketing", title: "Research", order_idx: 1, estimate_hours: 2, percent_complete: 0, source: "template" as const }] };
    const state = { ...planned, now, anchor: "2026-11-09" };
    const rows = toRows(state, "user-123");
    for (const table of Object.values(rows)) {
      for (const r of Array.isArray(table) ? table : [table]) expect((r as { user_id: string }).user_id).toBe("user-123");
    }
    expect(fromRows(rows)).toEqual(state);
  });
});
