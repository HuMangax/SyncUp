import { DateTime } from "luxon";
import type {
  DiffEntry,
  PlanData,
  PlanSnapshot,
  Proposal,
  ProposalTrigger,
  ReasonCode,
  RiskEntry,
  StudySession,
  Warning,
} from "@/lib/types";
import { isLocked, schedule } from "@/lib/scheduler";
import { paddedRemainingHours } from "@/lib/scheduler/pace";
import { checkFeasibility } from "@/lib/feasibility/check";
import { toPlannerState } from "@/lib/planner";
import { roundUpToSlots, slotCeil, slotFloor, slotsToHours } from "@/lib/time/slots";
import { reconcile, type Pair } from "./diff";

const byStart = (a: StudySession, b: StudySession) =>
  a.start_at.localeCompare(b.start_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const hoursOf = (s: StudySession) => (Date.parse(s.end_at) - Date.parse(s.start_at)) / 3_600_000;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Future scheduled sessions that a replan may move. Everything else is history or locked. */
export const isMovable = (s: StudySession, now: string) => s.status === "scheduled" && !isLocked(s, slotCeil(now));

/** The first plan, applied directly: there is no previous plan to review against. */
export function generateInitial(
  data: PlanData,
  now: string,
): { data: PlanData; warnings: Warning[]; risk: RiskEntry[]; unplaced: Record<string, number> } {
  const state = toPlannerState(data, now);
  const plan = schedule(state, now);
  const { warnings, risk } = checkFeasibility(state, now, plan);
  const kept = data.sessions.filter((s) => !isMovable(s, now));
  return {
    data: { ...data, sessions: [...kept, ...plan.sessions].sort(byStart), planVersion: data.planVersion + 1 },
    warnings,
    risk,
    unplaced: plan.unplaced,
  };
}

/**
 * Pipeline: (progress already applied to `data`) -> replan with locked sessions occupied ->
 * stabilize -> diff with reason codes -> risk per deadline -> pending proposal.
 */
export function buildProposal(
  data: PlanData,
  now: string,
  trigger: ProposalTrigger,
  id: string,
  prior_triggers: ProposalTrigger[] = [],
): Proposal {
  const state = toPlannerState(data, now);
  const plan = schedule(state, now);
  const prev = data.sessions.filter((s) => isMovable(s, now));
  const { sessions, pairs, isStillValid } = reconcile(prev, plan.sessions, state, now);
  const { warnings, risk } = checkFeasibility(state, now, { ...plan, sessions });

  // Hours already planned per assignment (movable + locked-but-not-yet-done) vs hours now needed.
  const h0 = slotCeil(now);
  const plannedBefore = new Map<string, number>();
  for (const s of data.sessions) {
    const counts = isMovable(s, now) || (s.status === "scheduled" && isLocked(s, h0) && slotCeil(s.end_at) > h0);
    if (!counts) continue;
    const slots = slotCeil(s.end_at) - Math.max(slotFloor(s.start_at), isMovable(s, now) ? -Infinity : h0);
    plannedBefore.set(s.assignment_id, (plannedBefore.get(s.assignment_id) ?? 0) + slotsToHours(slots));
  }
  const needNow = new Map(data.assignments.map((a) => [a.id, slotsToHours(roundUpToSlots(paddedRemainingHours(a)))]));
  const riskOf = new Map(risk.map((r) => [r.assignment_id, r.level]));
  const title = new Map(data.assignments.map((a) => [a.id, a.title]));
  const missedIds = new Set(
    [trigger, ...prior_triggers].flatMap((t) => (t.type === "session_status" && t.status === "missed" ? [t.session_id] : [])),
  );
  const missedOf = (aid: string) =>
    data.sessions.filter((s) => missedIds.has(s.id) && s.status === "missed" && s.assignment_id === aid);

  const diff: DiffEntry[] = pairs.map((p) => {
    if (p.kind === "kept") return { kind: "kept", assignment_id: p.after!.assignment_id, before: p.before, after: p.after };
    const aid = (p.after ?? p.before)!.assignment_id;
    const { reason, explanation } = explain(p, aid);
    return { kind: p.kind, assignment_id: aid, before: p.before, after: p.after, reason, explanation };
  });

  function explain(p: Pair, aid: string): { reason: ReasonCode; explanation: string } {
    const t = title.get(aid) ?? "This assignment";
    if (p.before && !isStillValid(p.before)) {
      const clash = state.busy.find(
        (b) => Date.parse(b.start_at) < Date.parse(p.before!.end_at) && Date.parse(p.before!.start_at) < Date.parse(b.end_at),
      );
      return {
        reason: "CONFLICT",
        explanation: clash ? `The old time now clashes with ${clash.title}.` : "The old time no longer fits your schedule settings.",
      };
    }
    const before = r2(plannedBefore.get(aid) ?? 0);
    const need = r2(needNow.get(aid) ?? 0);
    const ahead = { reason: "AHEAD_PACE" as const, explanation: `${t} only needs ${need} h now (down from ${before} h), so less time is booked.` };
    const behind = { reason: "BEHIND_PACE" as const, explanation: `${t} needs ${need} h, more than the ${before} h still planned.` };
    const delta = p.before && p.after ? hoursOf(p.after) - hoursOf(p.before) : p.after ? 1 : -1; // + more time, - less
    const missed = missedOf(aid);

    if (missed.length > 0 && delta >= 0) {
      const h = r2(missed.reduce((sum, s) => sum + hoursOf(s), 0));
      return { reason: "MISSED_RETURNED", explanation: `You missed ${h} h of ${t}, so that time went back into the plan.` };
    }
    if (delta < 0 && need < before - 0.01) return ahead;
    if (delta > 0 && need > before + 0.01) return behind;
    const earlier = p.before && p.after && Date.parse(p.after.start_at) < Date.parse(p.before.start_at);
    if ((riskOf.get(aid) ?? "on_track") !== "on_track" && (p.kind === "added" || earlier)) {
      return { reason: "DEADLINE_PROTECTION", explanation: `Moved earlier to protect the ${t} deadline.` };
    }
    return { reason: "REBALANCE", explanation: "Shifted to make room for other work." };
  }

  return {
    id,
    created_at: now,
    trigger,
    prior_triggers,
    base_version: data.planVersion,
    new_sessions: sessions,
    diff,
    risk,
    warnings,
    state: "pending",
  };
}

/** Accept: write the proposed sessions, keep history and locked sessions, snapshot for undo. */
export function acceptProposal(data: PlanData, p: Proposal, now: string): { data: PlanData; snapshot: PlanSnapshot } {
  const snapshot: PlanSnapshot = {
    version: data.planVersion,
    sessions: data.sessions,
    assignments: data.assignments,
    created_at: now,
  };
  const kept = data.sessions.filter((s) => !isMovable(s, now));
  return {
    data: { ...data, sessions: [...kept, ...p.new_sessions].sort(byStart), planVersion: data.planVersion + 1 },
    snapshot,
  };
}

/** One-step undo: restore the snapshot taken at accept time. */
export function undoAccept(data: PlanData, snapshot: PlanSnapshot): PlanData {
  return { ...data, sessions: snapshot.sessions, assignments: snapshot.assignments, planVersion: snapshot.version };
}

/** "Mon 6:00 PM" style label for UI and explanations. */
export const sessionLabel = (s: StudySession, zone: string) =>
  `${DateTime.fromISO(s.start_at, { zone: "utc" }).setZone(zone).toFormat("ccc h:mm a")}`;
