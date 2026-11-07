"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Assignment,
  CalendarEvent,
  PlanData,
  PlanSnapshot,
  Proposal,
  ProposalTrigger,
  RiskEntry,
  SessionStatus,
  StudySession,
  Subtask,
  Suggestion,
  UserSettings,
  Warning,
} from "@/lib/types";
import { createSeed, demoAnchorFor } from "@/lib/demo/seed";
import { markNextMissed, squeezeWeek, surpriseShift } from "@/lib/demo/controls";
import { acceptProposal, buildProposal, generateInitial, undoAccept } from "@/lib/progress/proposal";
import { applySessionStatus, remainingHours, setPercent, setRemaining } from "@/lib/progress/remaining";

type Undo = { snapshot: PlanSnapshot; warnings: Warning[]; risk: RiskEntry[] };

type Data = {
  anchor: string;
  /** Simulated clock (UTC ISO). All "now" values come from here, never the system clock. */
  now: string;
  settings: UserSettings;
  assignments: Assignment[];
  subtasks: Subtask[];
  events: CalendarEvent[];
  sessions: StudySession[];
  planVersion: number;
  proposals: Proposal[];
  /** One-step undo after accept. */
  undo: Undo | null;
  /** Warnings and risk of the current accepted plan. */
  warnings: Warning[];
  risk: RiskEntry[];
};

export type PlannerStore = Data & {
  reset: () => void;
  advanceClock: (hours: number) => void;
  generatePlan: () => void;
  markSession: (id: string, status: SessionStatus, minutesDone?: number) => void;
  togglePin: (id: string) => void;
  setProgress: (assignmentId: string, change: { percent?: number; remaining?: number }) => void;
  updateSettings: (patch: Partial<UserSettings>) => void;
  applySuggestion: (s: Suggestion) => void;
  accept: (proposalId: string) => void;
  reject: (proposalId: string) => void;
  undoLast: () => void;
  demoMarkNextMissed: () => void;
  demoLogMarketing: () => void;
  demoSurpriseShift: () => void;
  demoSqueezeWeek: () => void;
};

const initial = (): Data => {
  const seed = createSeed(demoAnchorFor(new Date().toISOString()));
  return {
    anchor: seed.anchor,
    now: seed.now,
    settings: seed.settings,
    assignments: seed.assignments,
    subtasks: seed.subtasks,
    events: seed.events,
    sessions: seed.sessions,
    planVersion: 1,
    proposals: [],
    undo: null,
    warnings: [],
    risk: [],
  };
};

const planData = (s: Data): PlanData => ({
  settings: s.settings,
  assignments: s.assignments,
  subtasks: s.subtasks,
  sessions: s.sessions,
  events: s.events,
  planVersion: s.planVersion,
});

export const pendingProposal = (proposals: Proposal[]) => proposals.find((p) => p.state === "pending");

export const usePlanner = create<PlannerStore>()(
  persist(
    (set, get) => {
      /**
       * Record the change (facts such as progress or a new event apply now), then build a proposal
       * for the schedule. A pending proposal is superseded; the new one builds from the current plan.
       */
      const propose = (next: PlanData, trigger: ProposalTrigger, now = get().now) => {
        const s = get();
        const prev = pendingProposal(s.proposals);
        const prior = prev ? [prev.trigger, ...prev.prior_triggers] : [];
        const proposals = s.proposals.map((p) => (p.state === "pending" ? { ...p, state: "superseded" as const } : p));
        const p = buildProposal(next, now, trigger, `p-${s.proposals.length + 1}`, prior);
        set({ ...next, now, proposals: [...proposals, p].slice(-20) });
      };

      return {
        ...initial(),

        reset: () => set(initial()),

        advanceClock: (hours) => set((s) => ({ now: new Date(Date.parse(s.now) + hours * 3_600_000).toISOString() })),

        generatePlan: () => {
          const s = get();
          const g = generateInitial(planData(s), s.now);
          set({ ...g.data, warnings: g.warnings, risk: g.risk });
        },

        markSession: (id, status, minutesDone) => {
          const s = get();
          propose(applySessionStatus(planData(s), id, status, minutesDone), {
            type: "session_status",
            session_id: id,
            status,
            minutes_done: minutesDone,
          });
        },

        // Pinning only locks a session in place; nothing else moves, so no proposal is needed.
        togglePin: (id) => set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, pinned: !x.pinned } : x)) })),

        setProgress: (assignmentId, change) => {
          const s = get();
          const assignments = s.assignments.map((a) => {
            if (a.id !== assignmentId) return a;
            if (change.remaining != null) return setRemaining(a, change.remaining);
            if (change.percent != null) return setPercent(a, change.percent);
            return a;
          });
          propose(
            { ...planData(s), assignments },
            { type: "progress", assignment_id: assignmentId, percent: change.percent, remaining_hours: change.remaining },
          );
        },

        updateSettings: (patch) => {
          const s = get();
          propose({ ...planData(s), settings: { ...s.settings, ...patch } }, { type: "settings" });
        },

        applySuggestion: (sg) => {
          const s = get();
          const a = sg.action;
          if (a.type === "raise_max_hours") get().updateSettings({ max_hours_per_day: s.settings.max_hours_per_day + a.by });
          else if (a.type === "open_free_day") get().updateSettings({ free_days: s.settings.free_days.filter((d) => d !== a.day) });
          else if (a.type === "longer_sessions") get().updateSettings({ session_max: a.max_minutes });
          else if (a.type === "trim_scope") {
            const target = s.assignments.find((x) => x.id === a.assignment_id);
            if (target) get().setProgress(target.id, { remaining: Math.max(0, remainingHours(target) - a.hours) });
          }
        },

        accept: (proposalId) => {
          const s = get();
          const p = s.proposals.find((x) => x.id === proposalId);
          if (!p || p.state !== "pending") return;
          if (p.base_version !== s.planVersion) {
            set({ proposals: s.proposals.map((x) => (x.id === p.id ? { ...x, state: "superseded" as const } : x)) });
            return;
          }
          const { data, snapshot } = acceptProposal(planData(s), p, s.now);
          set({
            ...data,
            warnings: p.warnings,
            risk: p.risk,
            undo: { snapshot, warnings: s.warnings, risk: s.risk },
            proposals: s.proposals.map((x) => (x.id === p.id ? { ...x, state: "accepted" as const } : x)),
          });
        },

        reject: (proposalId) =>
          set((s) => ({
            proposals: s.proposals.map((x) =>
              x.id === proposalId && x.state === "pending" ? { ...x, state: "rejected" as const } : x,
            ),
          })),

        undoLast: () => {
          const s = get();
          if (!s.undo) return;
          set({
            ...undoAccept(planData(s), s.undo.snapshot),
            warnings: s.undo.warnings,
            risk: s.undo.risk,
            undo: null,
            proposals: s.proposals.map((x) => (x.state === "pending" ? { ...x, state: "superseded" as const } : x)),
          });
        },

        demoMarkNextMissed: () => {
          const s = get();
          const r = markNextMissed(planData(s), s.now);
          if (r) propose(r.data, { type: "session_status", session_id: r.sessionId, status: "missed" }, r.now);
        },

        // "Log 1 h on Marketing and set 25%": the student types the percent and the plan follows it.
        demoLogMarketing: () => get().setProgress("a-marketing", { percent: 25 }),

        demoSurpriseShift: () => {
          const s = get();
          propose(surpriseShift(planData(s), s.now), { type: "calendar_change" });
        },

        demoSqueezeWeek: () => {
          const s = get();
          propose(squeezeWeek(planData(s), s.now), { type: "calendar_change" });
        },
      };
    },
    {
      name: "adaptive-planner-v3",
      storage: createJSONStorage(() => localStorage),
      // Rehydrated on the client after mount to avoid SSR hydration mismatches.
      skipHydration: true,
    },
  ),
);
