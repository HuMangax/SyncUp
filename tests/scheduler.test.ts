import { describe, expect, it } from "vitest";
import { schedule } from "@/lib/scheduler";
import { paddedRemainingHours } from "@/lib/scheduler/pace";
import { roundUpToSlots, slotsToHours, localDateKey, localToUtc, addDays } from "@/lib/time/slots";
import type { Assignment, PlannerState, StudySession, Subtask } from "@/lib/types";
import { ANCHOR, hours, seedState, violations } from "./helpers";

/** Hard-limit check that cannot pass vacuously on an empty plan. */
function valid(state: PlannerState, now: string, plan: ReturnType<typeof schedule>) {
  expect(plan.sessions.length).toBeGreaterThan(0);
  expect(violations(state, now, plan)).toEqual([]);
}

describe("paddedRemainingHours", () => {
  const base = seedState().state.assignments;
  it("pads by difficulty (x1.0 / x1.1 / x1.2)", () => {
    expect(paddedRemainingHours(base[0])).toBeCloseTo(8.8); // 8 h, difficulty 2
    expect(paddedRemainingHours(base[1])).toBeCloseTo(14.4); // 12 h, difficulty 3
    expect(paddedRemainingHours({ ...base[0], difficulty: 1 })).toBeCloseTo(8);
  });
  it("uses percent complete, and the override wins when set", () => {
    expect(paddedRemainingHours({ ...base[0], difficulty: 1, percent_complete: 25 })).toBeCloseTo(6);
    expect(paddedRemainingHours({ ...base[0], difficulty: 1, percent_complete: 25, remaining_override: 3 })).toBeCloseTo(3);
  });
  it("is zero for completed assignments", () => {
    expect(paddedRemainingHours({ ...base[0], status: "completed" })).toBe(0);
  });
});

const placedHours = (sessions: StudySession[], id: string) =>
  sessions.filter((s) => s.assignment_id === id).reduce((h, s) => h + hours(s), 0);

describe("schedule() on the seeded demo", () => {
  const { state, now } = seedState();
  const plan = schedule(state, now);

  it("places every hour of the opening plan (no shortfall)", () => {
    expect(plan.sessions.length).toBeGreaterThan(0);
    expect(plan.unplaced).toEqual({});
    for (const a of state.assignments) {
      expect(placedHours(plan.sessions, a.id)).toBeCloseTo(slotsToHours(roundUpToSlots(paddedRemainingHours(a))), 5);
    }
  });

  it("breaks no hard limit (events, sleep, free days, daily max, min/max length, deadlines)", () => {
    valid(state, now, plan);
  });

  it("never touches a personal commitment, even with the break buffer", () => {
    const buf = state.settings.break_min * 60_000;
    for (const s of plan.sessions)
      for (const b of state.busy)
        expect(Date.parse(s.start_at) < Date.parse(b.end_at) + buf && Date.parse(b.start_at) - buf < Date.parse(s.end_at)).toBe(false);
  });

  it("reserves a break between consecutive sessions", () => {
    expect(plan.sessions.length).toBeGreaterThan(1);
    const sorted = [...plan.sessions].sort((a, b) => a.start_at.localeCompare(b.start_at));
    for (let i = 1; i < sorted.length; i++) {
      const gap = (Date.parse(sorted[i].start_at) - Date.parse(sorted[i - 1].end_at)) / 60_000;
      expect(gap).toBeGreaterThanOrEqual(state.settings.break_min);
    }
  });

  it("prefers the evening window when it has room", () => {
    const evening = plan.sessions.filter((s) => {
      const h = Number(new Date(s.start_at).toLocaleString("en-US", { timeZone: state.settings.timezone, hour: "numeric", hourCycle: "h23" }));
      return h >= 18 && h < 22;
    });
    expect(evening.length).toBeGreaterThan(0);
  });

  it("is deterministic: same input gives the same output, regardless of input order", () => {
    expect(plan.sessions.length).toBeGreaterThan(0);
    expect(schedule(state, now)).toEqual(plan);
    const shuffled: PlannerState = {
      ...state,
      assignments: [...state.assignments].reverse(),
      busy: [...state.busy].reverse(),
    };
    expect(schedule(shuffled, now)).toEqual(plan);
  });

  it("does not mutate its input", () => {
    const copy = structuredClone(state);
    schedule(state, now);
    expect(state).toEqual(copy);
  });
});

describe("hard limits under custom settings", () => {
  it("respects a sleep window that starts after midnight", () => {
    const { state, now } = seedState();
    const s: PlannerState = { ...state, settings: { ...state.settings, bed_time: "01:00", wake_time: "09:00", wind_down_min: 30 } };
    valid(s, now, schedule(s, now));
  });

  it("keeps free days free", () => {
    const { state, now } = seedState();
    const s: PlannerState = { ...state, settings: { ...state.settings, free_days: [0, 6] } };
    const plan = schedule(s, now);
    valid(s, now, plan);
  });

  it("respects a low daily max", () => {
    const { state, now } = seedState();
    const s: PlannerState = { ...state, settings: { ...state.settings, max_hours_per_day: 2 } };
    valid(s, now, schedule(s, now));
  });

  it("treats pinned and soon-starting sessions as occupied and never returns them", () => {
    const { state, now } = seedState();
    const zone = state.settings.timezone;
    const pinned: StudySession = {
      id: "pinned-1", assignment_id: "a-stats", subtask_id: null,
      start_at: localToUtc(addDays(ANCHOR, 1), "18:00", zone), end_at: localToUtc(addDays(ANCHOR, 1), "20:00", zone),
      status: "scheduled", minutes_done: 0, pinned: true, plan_version: 1,
    };
    const soon: StudySession = {
      ...pinned, id: "soon-1", pinned: false, assignment_id: "a-marketing",
      start_at: localToUtc(ANCHOR, "09:00", zone), end_at: localToUtc(ANCHOR, "10:00", zone),
    };
    const s: PlannerState = { ...state, sessions: [pinned, soon] };
    const plan = schedule(s, now);
    expect(plan.sessions.find((x) => x.id === "pinned-1" || x.id === "soon-1")).toBeUndefined();
    valid(s, now, plan);
    // Locked hours count toward the assignment.
    const stats = s.assignments.find((a) => a.id === "a-stats")!;
    expect(placedHours(plan.sessions, "a-stats") + 2).toBeCloseTo(slotsToHours(roundUpToSlots(paddedRemainingHours(stats))), 5);
  });

  it("drops future unlocked scheduled sessions and replans them", () => {
    const { state, now } = seedState();
    const zone = state.settings.timezone;
    const old: StudySession = {
      id: "old-1", assignment_id: "a-marketing", subtask_id: null,
      start_at: localToUtc(addDays(ANCHOR, 2), "11:00", zone), end_at: localToUtc(addDays(ANCHOR, 2), "12:00", zone),
      status: "scheduled", minutes_done: 0, pinned: false, plan_version: 1,
    };
    const plan = schedule({ ...state, sessions: [old] }, now);
    expect(plan.sessions.length).toBeGreaterThan(0);
    expect(plan).toEqual(schedule(state, now));
  });
});

describe("deadlines and shortage", () => {
  it("reports hours_short instead of breaking a limit, and low priority absorbs the shortfall", () => {
    const { state, now } = seedState();
    const s: PlannerState = {
      ...state,
      settings: { ...state.settings, max_hours_per_day: 1 },
    };
    const plan = schedule(s, now);
    valid(s, now, plan);
    const short = Object.values(plan.unplaced).reduce((a, b) => a + b, 0);
    expect(short).toBeGreaterThan(0);
    // Priority 3 (stats) should be short by less than priority 1 (operations), relative to need.
    const need = (id: string) => paddedRemainingHours(s.assignments.find((a) => a.id === id)!);
    const frac = (id: string) => (plan.unplaced[id] ?? 0) / need(id);
    expect(frac("a-stats")).toBeLessThanOrEqual(frac("a-operations"));
  });

  it("schedules nothing for completed or zero-remaining work", () => {
    const { state, now } = seedState();
    const s: PlannerState = {
      ...state,
      assignments: state.assignments.map((a) => (a.id === "a-marketing" ? { ...a, percent_complete: 100 } : a)),
    };
    const plan = schedule(s, now);
    expect(plan.sessions.length).toBeGreaterThan(0);
    expect(plan.sessions.some((x) => x.assignment_id === "a-marketing")).toBe(false);
  });
});

describe("session shape", () => {
  it("prefers a free run that fits a whole session over a short preferred-window scrap", () => {
    const { state, now } = seedState();
    const zone = state.settings.timezone;
    // Evening window 18:00-22:00 is blocked until 21:30 (event + 15 min buffer), leaving a 30-min scrap.
    const s: PlannerState = {
      ...state,
      assignments: [state.assignments[0]],
      busy: [...state.busy, { event_id: "ev-x", title: "Club", kind: "social", start_at: localToUtc(ANCHOR, "17:00", zone), end_at: localToUtc(ANCHOR, "21:15", zone) }],
    };
    const monday = schedule(s, now).sessions.filter((x) => localDateKey(x.start_at, zone) === ANCHOR);
    expect(monday.length).toBeGreaterThan(0);
    for (const x of monday) expect(hours(x)).toBeGreaterThanOrEqual(1);
  });
});

describe("exams", () => {
  it("caps an exam at 3 h per day and spreads 6 h+ over at least 3 days", () => {
    const { state, now } = seedState();
    const plan = schedule(state, now);
    const zone = state.settings.timezone;
    const byDay = new Map<string, number>();
    for (const x of plan.sessions.filter((x) => x.assignment_id === "a-stats")) {
      const d = localDateKey(x.start_at, zone);
      byDay.set(d, (byDay.get(d) ?? 0) + hours(x));
    }
    expect(byDay.size).toBeGreaterThanOrEqual(3);
    for (const h of byDay.values()) expect(h).toBeLessThanOrEqual(3);
  });
});

describe("subtasks", () => {
  it("tags sessions with subtasks in order_idx order", () => {
    const { state, now } = seedState();
    const subtasks: Subtask[] = [
      { id: "st-b", assignment_id: "a-marketing", title: "Draft", order_idx: 2, estimate_hours: 4, percent_complete: 0, source: "template" },
      { id: "st-a", assignment_id: "a-marketing", title: "Research", order_idx: 1, estimate_hours: 2, percent_complete: 0, source: "template" },
      { id: "st-c", assignment_id: "a-marketing", title: "Edit", order_idx: 3, estimate_hours: 2, percent_complete: 0, source: "template" },
    ];
    const plan = schedule({ ...state, subtasks }, now);
    const order = plan.sessions
      .filter((s) => s.assignment_id === "a-marketing")
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .map((s) => subtasks.find((t) => t.id === s.subtask_id)!.order_idx);
    expect(order.length).toBeGreaterThan(0);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBe(1);
    expect(order.at(-1)).toBe(3);
  });
});

describe("performance", () => {
  it("schedules 20 assignments over 28 days in under 200 ms", () => {
    const { state, now } = seedState();
    const zone = state.settings.timezone;
    const assignments: Assignment[] = Array.from({ length: 20 }, (_, i) => ({
      ...state.assignments[i % 3],
      id: `perf-${String(i).padStart(2, "0")}`,
      due_at: localToUtc(addDays(ANCHOR, 6 + i), "17:00", zone),
      estimate_hours: 3 + (i % 5),
      type: i % 4 === 0 ? "exam" : "assignment",
    }));
    const s: PlannerState = { ...state, assignments };
    schedule(s, now); // warm-up
    const t0 = performance.now();
    const plan = schedule(s, now);
    expect(performance.now() - t0).toBeLessThan(200);
    valid(s, now, plan);
  });
});
