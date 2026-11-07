import { describe, expect, it } from "vitest";
import { applySessionStatus, remainingHours, setPercent, setRemaining } from "@/lib/progress/remaining";
import { acceptProposal, buildProposal, generateInitial, undoAccept } from "@/lib/progress/proposal";
import { isLocked } from "@/lib/scheduler";
import { localToUtc, slotCeil } from "@/lib/time/slots";
import type { PlanData, StudySession } from "@/lib/types";
import { ANCHOR, hours, proposalViolations, seedData } from "./helpers";

const planned = () => {
  const { data, now } = seedData();
  return { data: generateInitial(data, now).data, now };
};
const firstOf = (d: PlanData, id: string) =>
  [...d.sessions].filter((s) => s.assignment_id === id).sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
const movable = (d: PlanData, now: string) =>
  d.sessions.filter((s) => s.status === "scheduled" && !isLocked(s, slotCeil(now)));

describe("remaining hours", () => {
  const a = seedData().data.assignments[0]; // 8 h
  it("8 h at 25% leaves 6 h", () => expect(remainingHours(setPercent(a, 25))).toBeCloseTo(6));
  it("a manual remaining-hours override wins", () => expect(remainingHours(setRemaining(setPercent(a, 25), 3))).toBeCloseTo(3));
  it("editing percent clears the override", () => {
    const b = setPercent(setRemaining(a, 3), 50);
    expect(b.remaining_override).toBeNull();
    expect(remainingHours(b)).toBeCloseTo(4);
  });
  it("100% marks the assignment completed", () => expect(setPercent(a, 100).status).toBe("completed"));
});

describe("session status", () => {
  it("missed returns the full hours: percent unchanged", () => {
    const { data } = planned();
    const s = firstOf(data, "a-marketing");
    const d = applySessionStatus(data, s.id, "missed");
    expect(d.sessions.find((x) => x.id === s.id)!.status).toBe("missed");
    expect(d.assignments.find((a) => a.id === "a-marketing")!.percent_complete).toBe(0);
  });
  it("partial credits minutes done (60 min of 8 h = 12.5%)", () => {
    const { data } = planned();
    const s = firstOf(data, "a-marketing");
    const d = applySessionStatus(data, s.id, "partial", 60);
    expect(d.sessions.find((x) => x.id === s.id)!.minutes_done).toBe(60);
    expect(d.assignments.find((a) => a.id === "a-marketing")!.percent_complete).toBeCloseTo(12.5);
  });
  it("completed credits the full session length", () => {
    const { data } = planned();
    const s = firstOf(data, "a-marketing");
    const d = applySessionStatus(data, s.id, "completed");
    expect(d.sessions.find((x) => x.id === s.id)!.minutes_done).toBe(hours(s) * 60);
    expect(d.assignments.find((a) => a.id === "a-marketing")!.percent_complete).toBeCloseTo((hours(s) / 8) * 100);
  });
});

describe("proposals", () => {
  it("a no-op change keeps every session", () => {
    const { data, now } = planned();
    const p = buildProposal(data, now, { type: "clock" }, "p-1");
    expect(p.diff.length).toBeGreaterThan(0);
    expect(p.diff.every((e) => e.kind === "kept")).toBe(true);
    expect(p.new_sessions).toEqual(movable(data, now));
  });

  it("a missed session returns its hours with MISSED_RETURNED and breaks no hard limit", () => {
    const { data, now } = planned();
    const s = firstOf(data, "a-marketing");
    const d = applySessionStatus(data, s.id, "missed");
    const p = buildProposal(d, now, { type: "session_status", session_id: s.id, status: "missed" }, "p-1");
    const changed = p.diff.filter((e) => e.kind !== "kept");
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.some((e) => e.assignment_id === "a-marketing" && e.reason === "MISSED_RETURNED")).toBe(true);
    for (const e of changed) {
      expect(e.reason).toBeDefined();
      expect(e.explanation).toBeTruthy();
    }
    const mk = p.new_sessions.filter((x) => x.assignment_id === "a-marketing").reduce((h, x) => h + hours(x), 0);
    expect(mk).toBeCloseTo(9); // 8 h x 1.1 = 8.8, rounded up to the 15-min grid
    expect(proposalViolations(d, now, p.new_sessions)).toEqual([]);
  });

  it("missing one session does not reshuffle other assignments", () => {
    const { data, now } = planned();
    const s = firstOf(data, "a-marketing");
    const d = applySessionStatus(data, s.id, "missed");
    const p = buildProposal(d, now, { type: "session_status", session_id: s.id, status: "missed" }, "p-1");
    const others = p.diff.filter((e) => e.assignment_id !== "a-marketing");
    expect(others.length).toBeGreaterThan(0);
    expect(others.filter((e) => e.kind !== "kept")).toEqual([]);
  });

  it("never puts work back into the slot of a session the student said they would miss", () => {
    const { data, now } = planned();
    const s = firstOf(data, "a-marketing"); // still in the future
    const d = applySessionStatus(data, s.id, "missed");
    const p = buildProposal(d, now, { type: "session_status", session_id: s.id, status: "missed" }, "p-1");
    const overlapsMissed = (x: StudySession) => Date.parse(x.start_at) < Date.parse(s.end_at) && Date.parse(s.start_at) < Date.parse(x.end_at);
    expect(p.new_sessions.filter(overlapsMissed)).toEqual([]);
  });

  it("a superseding proposal still explains an earlier missed session", () => {
    const { data, now } = planned();
    const s = firstOf(data, "a-marketing");
    const d = applySessionStatus(data, s.id, "missed");
    const missedTrigger = { type: "session_status", session_id: s.id, status: "missed" } as const;
    const p = buildProposal(d, now, { type: "clock" }, "p-2", [missedTrigger]);
    expect(p.prior_triggers).toEqual([missedTrigger]);
    expect(p.diff.some((e) => e.assignment_id === "a-marketing" && e.reason === "MISSED_RETURNED")).toBe(true);
  });

  it("missed then 25%: shortened sessions say AHEAD_PACE, returned time says MISSED_RETURNED", () => {
    const { data, now } = planned();
    const s = firstOf(data, "a-marketing");
    let d = applySessionStatus(data, s.id, "missed");
    d = { ...d, assignments: d.assignments.map((a) => (a.id === "a-marketing" ? setPercent(a, 25) : a)) };
    const missedTrigger = { type: "session_status", session_id: s.id, status: "missed" } as const;
    const p = buildProposal(d, now, { type: "progress", assignment_id: "a-marketing", percent: 25 }, "p-2", [missedTrigger]);
    const changed = p.diff.filter((e) => e.kind !== "kept");
    const shorter = changed.filter((e) => e.kind === "moved" && hours(e.after!) < hours(e.before!));
    expect(shorter.length).toBeGreaterThan(0);
    for (const e of shorter) expect(e.reason).toBe("AHEAD_PACE");
    for (const e of changed.filter((e) => e.kind === "removed")) expect(e.reason).toBe("AHEAD_PACE");
    expect(changed.some((e) => e.reason === "MISSED_RETURNED")).toBe(true);
  });

  it("deleting or completing an assignment frees its sessions with a clear reason", () => {
    const { data, now } = planned();
    for (const d of [
      { ...data, assignments: data.assignments.filter((a) => a.id !== "a-operations") },
      { ...data, assignments: data.assignments.map((a) => (a.id === "a-operations" ? setPercent(a, 100) : a)) },
    ]) {
      const p = buildProposal(d, now, { type: "assignment_change" }, "p-1");
      const ops = p.diff.filter((e) => e.assignment_id === "a-operations");
      expect(ops.length).toBeGreaterThan(0);
      for (const e of ops) {
        expect(e.kind).toBe("removed");
        expect(e.explanation).toMatch(/done|removed/);
      }
    }
  });

  it("adding subtasks tags sessions that stay in place", () => {
    const { data, now } = planned();
    const subtasks = [1, 2, 3].map((i) => ({
      id: `st-${i}`, assignment_id: "a-marketing", title: `Step ${i}`, order_idx: i, estimate_hours: 8 / 3, percent_complete: 0, source: "template" as const,
    }));
    const p = buildProposal({ ...data, subtasks }, now, { type: "assignment_change" }, "p-1");
    const mk = p.new_sessions.filter((x) => x.assignment_id === "a-marketing");
    expect(mk.length).toBeGreaterThan(0);
    expect(mk.every((x) => x.subtask_id?.startsWith("st-"))).toBe(true);
    expect(p.diff.filter((e) => e.assignment_id === "a-marketing").every((e) => e.kind === "kept")).toBe(true);
  });

  it("setting 25% shrinks the work with AHEAD_PACE and removes sessions", () => {
    const { data, now } = planned();
    const d = { ...data, assignments: data.assignments.map((a) => (a.id === "a-marketing" ? setPercent(a, 25) : a)) };
    const p = buildProposal(d, now, { type: "progress", assignment_id: "a-marketing", percent: 25 }, "p-1");
    expect(p.diff.some((e) => e.kind === "removed" && e.reason === "AHEAD_PACE")).toBe(true);
    const mk = p.new_sessions.filter((x) => x.assignment_id === "a-marketing").reduce((h, x) => h + hours(x), 0);
    expect(mk).toBeCloseTo(6.75); // 6 h x 1.1 = 6.6 -> 6.75
  });

  it("an unrelated change leaves other assignments' sessions where they were", () => {
    const { data, now } = planned();
    const d = { ...data, assignments: data.assignments.map((a) => (a.id === "a-operations" ? setPercent(a, 50) : a)) };
    const p = buildProposal(d, now, { type: "progress", assignment_id: "a-operations", percent: 50 }, "p-1");
    expect(p.diff.filter((e) => e.assignment_id === "a-marketing").every((e) => e.kind === "kept")).toBe(true);
  });

  it("locked sessions (completed, pinned, starting within 2 h) are identical after accept", () => {
    const { data, now: now0 } = planned();
    const now = new Date(Date.parse(now0) + 2 * 3_600_000).toISOString(); // Mon 10:00
    const zone = data.settings.timezone;
    const done: StudySession = {
      id: "done-1", assignment_id: "a-stats", subtask_id: null,
      start_at: localToUtc(ANCHOR, "07:30", zone), end_at: localToUtc(ANCHOR, "08:30", zone),
      status: "completed", minutes_done: 60, pinned: false, plan_version: 1,
    };
    const pinTarget = firstOf(data, "a-stats");
    let d: PlanData = { ...data, sessions: [...data.sessions.map((s) => (s.id === pinTarget.id ? { ...s, pinned: true } : s)), done] };
    const lockedBefore = d.sessions.filter((s) => isLocked(s, slotCeil(now)));
    expect(lockedBefore.length).toBeGreaterThanOrEqual(3); // done, pinned, the 10:45 session within 2 h
    d = applySessionStatus(d, firstOf(d, "a-marketing").id, "missed");
    const p = buildProposal(d, now, { type: "clock" }, "p-1");
    const after = acceptProposal(d, p, now).data;
    for (const s of lockedBefore) expect(after.sessions.find((x) => x.id === s.id)).toEqual(s);
  });

  it("accept then undo restores the plan exactly", () => {
    const { data, now } = planned();
    const d = applySessionStatus(data, firstOf(data, "a-marketing").id, "missed");
    const p = buildProposal(d, now, { type: "clock" }, "p-1");
    const { data: accepted, snapshot } = acceptProposal(d, p, now);
    expect(accepted.sessions).not.toEqual(d.sessions);
    expect(accepted.planVersion).toBe(d.planVersion + 1);
    expect(undoAccept(accepted, snapshot)).toEqual(d);
  });

  it("is deterministic", () => {
    const { data, now } = planned();
    const d = applySessionStatus(data, firstOf(data, "a-marketing").id, "missed");
    expect(buildProposal(d, now, { type: "clock" }, "p-1")).toEqual(buildProposal(d, now, { type: "clock" }, "p-1"));
  });
});
