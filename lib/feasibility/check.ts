import { DateTime } from "luxon";
import type { Assignment, Plan, PlannerState, RiskEntry, Suggestion, Warning } from "@/lib/types";
import { schedule } from "@/lib/scheduler";
import { buildGrid, countFree, lockedSessions } from "@/lib/scheduler/availability";
import { effectiveDeadlineSlot, paddedRemainingHours } from "@/lib/scheduler/pace";
import { remainingHours } from "@/lib/progress/remaining";
import { hoursToSlots, roundUpToSlots, slotCeil, slotFloor, slotsToHours, SLOTS_PER_HOUR, weekdayOf } from "@/lib/time/slots";

const TIGHT_SLACK = 0.1;
const OVERLAP_MS = 48 * 3_600_000;
const OVERLOAD_RATIO = 0.9;
const WEEK_SLOTS = 7 * 24 * SLOTS_PER_HOUR;
const r2 = (x: number) => Math.round(x * 100) / 100;
const totalShort = (p: Plan) => r2(Object.values(p.unplaced).reduce((a, b) => a + b, 0));

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Cumulative check, per deadline in order:
 *   required_i = padded remaining hours due at or before i
 *   capacity_i = sum over days up to its effective deadline of min(max - locked, free)
 * Risk: at_risk when the plan could not place everything; tight when slack is under 10%.
 */
export function checkFeasibility(
  state: PlannerState,
  now: string,
  plan: Plan,
): { warnings: Warning[]; risk: RiskEntry[] } {
  const { settings } = state;
  const zone = settings.timezone;
  const h0 = slotCeil(now);
  const locked = lockedSessions(state.sessions, h0);
  const active = state.assignments.filter((a) => a.status !== "completed" && remainingHours(a) > 0).sort(byId);
  const dueLabel = (a: Assignment) => DateTime.fromISO(a.due_at, { zone: "utc" }).setZone(zone).toFormat("ccc, LLL d");

  // Credit for locked, not-yet-done sessions (pinned / starting soon), as the scheduler does.
  const credit = new Map<string, number>();
  for (const s of locked) {
    if (s.status !== "scheduled") continue;
    const n = Math.max(0, slotCeil(s.end_at) - Math.max(slotFloor(s.start_at), h0));
    credit.set(s.assignment_id, (credit.get(s.assignment_id) ?? 0) + n);
  }
  const needSlots = (a: Assignment) => Math.max(0, roundUpToSlots(paddedRemainingHours(a)) - (credit.get(a.id) ?? 0));

  const deadlines = active.map((a) => ({ a, eff: effectiveDeadlineSlot(a) })).sort((x, y) => x.eff - y.eff || byId(x.a, y.a));
  const h1 = Math.max(h0 + 1, ...deadlines.map((d) => d.eff), h0 + WEEK_SLOTS);
  const grid = buildGrid(settings, state.busy, locked, h0, h1);
  const maxDay = hoursToSlots(settings.max_hours_per_day);
  const capacityUntil = (end: number) =>
    grid.days.reduce((sum, d) => {
      if (d.freeDay || d.start >= end) return sum;
      return sum + Math.min(Math.max(0, maxDay - d.lockedSlots), countFree(grid, d.start, Math.min(d.end, end)));
    }, 0);

  const warnings: Warning[] = [];
  const risk: RiskEntry[] = [];
  let required = 0;
  for (const { a, eff } of deadlines) {
    required += needSlots(a);
    const cap = capacityUntil(eff);
    const slack = required > 0 ? (cap - required) / required : 1;
    const short = plan.unplaced[a.id] ?? 0;
    const level = short > 0 ? "at_risk" : slack < TIGHT_SLACK ? "tight" : "on_track";
    risk.push({ assignment_id: a.id, level, hours_short: short, slack_pct: r2(slack * 100) });
    if (short > 0) {
      warnings.push({
        kind: "deadline_risk",
        severity: "red",
        assignment_id: a.id,
        hours_short: short,
        message: `${a.title} is ${short} h short before its deadline (${dueLabel(a)}). The plan places what fits without breaking your limits.`,
        suggestions: [],
      });
    } else if (level === "tight") {
      warnings.push({
        kind: "tight",
        severity: "yellow",
        assignment_id: a.id,
        hours_short: 0,
        message: `${a.title} fits, but with little room to spare before ${dueLabel(a)}.`,
        suggestions: [],
      });
    }
  }

  // Overlapping deadlines (2+ within 48 h)
  const byDue = [...active].sort((x, y) => x.due_at.localeCompare(y.due_at) || byId(x, y));
  for (let i = 1; i < byDue.length; i++) {
    const [p, q] = [byDue[i - 1], byDue[i]];
    if (Date.parse(q.due_at) - Date.parse(p.due_at) <= OVERLAP_MS) {
      warnings.push({
        kind: "overlap",
        severity: "yellow",
        assignment_id: q.id,
        hours_short: 0,
        message: `${p.title} and ${q.title} are due within 48 hours of each other. Start early on both.`,
        suggestions: [],
      });
    }
  }

  // Overloaded days (folded into one warning)
  const full = plan.loadByDay.filter(
    (d) => d.planned_hours > 0 && d.planned_hours >= OVERLOAD_RATIO * settings.max_hours_per_day,
  );
  if (full.length > 0) {
    const names = full.map((d) => DateTime.fromISO(d.day).toFormat("ccc d"));
    warnings.push({
      kind: "overloaded_day",
      severity: "yellow",
      day: full[0].day,
      hours_short: 0,
      message:
        full.length === 1
          ? `${DateTime.fromISO(full[0].day).toFormat("cccc, LLL d")} is nearly full: ${r2(full[0].planned_hours)} of ${settings.max_hours_per_day} h.`
          : `${full.length} days are at or near your ${settings.max_hours_per_day} h daily max: ${names.join(", ")}.`,
      suggestions: [],
    });
  }

  // Next 7 days: required work due this week vs available study time.
  const weekEnd = h0 + WEEK_SLOTS;
  const weekReq = slotsToHours(deadlines.filter((d) => d.eff <= weekEnd).reduce((s, d) => s + needSlots(d.a), 0));
  const weekCap = slotsToHours(capacityUntil(weekEnd));
  if (weekReq > 0 && weekReq > OVERLOAD_RATIO * weekCap) {
    const red = weekReq > weekCap;
    warnings.push({
      kind: "shortfall_week",
      severity: red ? "red" : "yellow",
      hours_short: red ? r2(weekReq - weekCap) : 0,
      message: `You have ${r2(weekReq)} h of work due in the next 7 days and ${r2(weekCap)} h of study time.`,
      suggestions: [],
    });
  }

  // What-if suggestions on red warnings: reruns of the same scheduler.
  const short = totalShort(plan);
  if (short > 0) {
    const sugg = suggestions(state, now, short);
    for (const w of warnings) if (w.severity === "red") w.suggestions = sugg;
  }

  const sev = (w: Warning) => (w.severity === "red" ? 0 : 1);
  warnings.sort(
    (x, y) =>
      sev(x) - sev(y) ||
      x.kind.localeCompare(y.kind) ||
      (x.assignment_id ?? "").localeCompare(y.assignment_id ?? "") ||
      (x.day ?? "").localeCompare(y.day ?? ""),
  );
  return { warnings, risk: risk.sort((x, y) => x.assignment_id.localeCompare(y.assignment_id)) };
}

/** Each suggestion is a what-if run of schedule(): "would recover X of Y hours". */
export function suggestions(state: PlannerState, now: string, short: number): Suggestion[] {
  const s = state.settings;
  const out: Suggestion[] = [];
  const tryIt = (id: string, label: string, action: Suggestion["action"], variant: PlannerState) => {
    const recovered = r2(short - totalShort(schedule(variant, now)));
    if (recovered > 0) out.push({ id, label, recovers_hours: Math.min(recovered, short), of_hours: short, action });
  };

  if (s.max_hours_per_day < 12) {
    tryIt("raise-max", `Raise your daily max to ${s.max_hours_per_day + 1} h`, { type: "raise_max_hours", by: 1 }, {
      ...state,
      settings: { ...s, max_hours_per_day: s.max_hours_per_day + 1 },
    });
  }

  if (s.free_days.length > 0) {
    // The earliest free day in the coming week.
    const today = weekdayOf(DateTime.fromISO(now, { zone: "utc" }).setZone(s.timezone).toISODate() as string);
    const day = [...s.free_days].sort((a, b) => ((a - today + 7) % 7) - ((b - today + 7) % 7))[0];
    const name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
    tryIt("open-day", `Study on ${name}s too`, { type: "open_free_day", day }, {
      ...state,
      settings: { ...s, free_days: s.free_days.filter((d) => d !== day) },
    });
  }

  if (s.session_max < 180) {
    tryIt("longer", "Allow sessions up to 3 h", { type: "longer_sessions", max_minutes: 180 }, {
      ...state,
      settings: { ...s, session_max: 180 },
    });
  }

  // Trim scope on the lowest-priority item (latest deadline, then id, breaks ties).
  const lowest = state.assignments
    .filter((a) => a.status !== "completed" && remainingHours(a) > 0)
    .sort((x, y) => x.priority - y.priority || y.due_at.localeCompare(x.due_at) || byId(x, y))[0];
  if (lowest) {
    const cut = Math.min(remainingHours(lowest), Math.ceil(short * 4) / 4);
    tryIt("trim", `Trim ${cut} h of scope from ${lowest.title}`, { type: "trim_scope", assignment_id: lowest.id, hours: cut }, {
      ...state,
      assignments: state.assignments.map((a) =>
        a.id === lowest.id ? { ...a, remaining_override: Math.max(0, remainingHours(a) - cut) } : a,
      ),
    });
  }
  return out;
}
