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
  EventOccurrence,
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
import { syncToGoogle } from "@/lib/calendar/sync-client";
import type { StoredState } from "@/lib/repo/rows";
import { acceptProposal, buildProposal, currentRisk, generateInitial, undoAccept } from "@/lib/progress/proposal";
import { applySessionStatus, remainingHours, setPercent, setRemaining } from "@/lib/progress/remaining";
import {
  assignmentFromInput,
  eventFromInput,
  parseImportedState,
  type AssignmentInput,
  type EventInput,
  type ExportedState,
} from "@/lib/validation";

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
  /** Sessions added or moved by the last accept, so the calendar can show what changed. */
  lastChanged: { ids: string[]; at: number } | null;
  /** Google Calendar is connected (set by Settings after checking the server). */
  googleConnected: boolean;
  /** Result of the last Google sync, shown on the calendar. */
  syncNote: string | null;
};

export type PlannerStore = Data & {
  reset: () => void;
  advanceClock: (hours: number) => void;
  generatePlan: () => void;
  /** Recompute warnings and risk for the current plan (e.g. after import). */
  generateWarnings: () => void;
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
  addAssignment: (input: AssignmentInput) => void;
  updateAssignment: (id: string, input: AssignmentInput) => void;
  deleteAssignment: (id: string) => void;
  completeAssignment: (id: string) => void;
  setSubtasks: (assignmentId: string, subtasks: Subtask[]) => void;
  addEvent: (input: EventInput) => void;
  deleteEvent: (id: string) => void;
  exportState: () => string;
  importState: (json: string) => { ok: true } | { ok: false; error: string };
  loadStored: (state: StoredState) => void;
  setGoogleConnected: (connected: boolean) => void;
  importGoogleEvents: (events: EventOccurrence[]) => void;
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
    lastChanged: null,
    googleConnected: false,
    syncNote: null,
  };
};

const nextId = (prefix: string, taken: { id: string }[]) => {
  let i = 1;
  while (taken.some((x) => x.id === `${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
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

        generateWarnings: () => {
          const s = get();
          const r = currentRisk(planData(s), s.now);
          set({ warnings: r.warnings, risk: r.risk });
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
          const changed = p.diff.filter((e) => e.kind === "moved" || e.kind === "added").map((e) => e.after!.id);
          set({
            ...data,
            // Wall-clock time only drives the highlight animation, never scheduling.
            lastChanged: { ids: changed, at: Date.now() },
            warnings: p.warnings,
            risk: p.risk,
            undo: { snapshot, warnings: s.warnings, risk: s.risk },
            proposals: s.proposals.map((x) => (x.id === p.id ? { ...x, state: "accepted" as const } : x)),
          });
          if (s.googleConnected) {
            // Best effort: never blocks the accept. Unsynced sessions are retried on the next accept.
            const nowMs = Date.parse(s.now);
            const upserts = data.sessions.filter(
              (x) => x.status === "scheduled" && Date.parse(x.end_at) > nowMs && (changed.includes(x.id) || !x.external_id),
            );
            const removes = p.diff.flatMap((e) => (e.kind === "removed" && e.before?.external_id ? [e.before.external_id] : []));
            set({ syncNote: "Syncing to Google Calendar…" });
            void syncToGoogle(s.settings.timezone, upserts, removes).then((r) => {
              if ("error" in r) return set({ syncNote: `Not synced to Google Calendar (${r.error}). Will retry next time.` });
              set((cur) => ({
                sessions: cur.sessions.map((x) => (r.synced[x.id] ? { ...x, external_id: r.synced[x.id] } : x)),
                syncNote: r.failed.length ? `${r.failed.length} sessions not synced. Will retry next time.` : "Synced to Google Calendar.",
              }));
            });
          }
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

        addAssignment: (input) => {
          const s = get();
          const a = assignmentFromInput(input, s.settings.timezone, nextId("a-user", s.assignments));
          propose({ ...planData(s), assignments: [...s.assignments, a] }, { type: "assignment_change" });
        },

        updateAssignment: (id, input) => {
          const s = get();
          const old = s.assignments.find((a) => a.id === id);
          if (!old) return;
          const a = assignmentFromInput(input, s.settings.timezone, id, old);
          propose({ ...planData(s), assignments: s.assignments.map((x) => (x.id === id ? a : x)) }, { type: "assignment_change" });
        },

        deleteAssignment: (id) => {
          const s = get();
          propose(
            {
              ...planData(s),
              assignments: s.assignments.filter((a) => a.id !== id),
              subtasks: s.subtasks.filter((t) => t.assignment_id !== id),
            },
            { type: "assignment_change" },
          );
        },

        completeAssignment: (id) => get().setProgress(id, { percent: 100 }),

        setSubtasks: (assignmentId, subtasks) => {
          const s = get();
          propose(
            { ...planData(s), subtasks: [...s.subtasks.filter((t) => t.assignment_id !== assignmentId), ...subtasks] },
            { type: "assignment_change" },
          );
        },

        addEvent: (input) => {
          const s = get();
          const ev = eventFromInput(input, s.settings.timezone, nextId("ev-user", s.events));
          propose({ ...planData(s), events: [...s.events, ev] }, { type: "calendar_change" });
        },

        // Only commitments added in this app can be removed; seeded/imported calendars stay read-only.
        deleteEvent: (id) => {
          const s = get();
          if (!id.startsWith("ev-user-")) return;
          propose({ ...planData(s), events: s.events.filter((e) => e.id !== id) }, { type: "calendar_change" });
        },

        exportState: () => {
          const s = get();
          const out: ExportedState = { version: 1, now: s.now, anchor: s.anchor, ...planData(s) };
          return JSON.stringify(out, null, 2);
        },

        loadStored: (v) => {
          set({
            anchor: v.anchor,
            now: v.now,
            settings: v.settings,
            assignments: v.assignments,
            subtasks: v.subtasks,
            sessions: v.sessions,
            events: v.events,
            planVersion: v.planVersion,
            proposals: [],
            undo: null,
          });
          get().generateWarnings();
        },

        setGoogleConnected: (connected) => set({ googleConnected: connected }),

        // Real calendar replaces the seeded simulated one; commitments the student added here stay.
        importGoogleEvents: (occ) => {
          const s = get();
          const google: CalendarEvent[] = occ.map((o) => ({
            id: `${o.event_id}-${o.start_at}`,
            source: "google",
            external_id: o.event_id.replace(/^g-/, ""),
            title: o.title,
            kind: o.kind,
            start_at: o.start_at,
            end_at: o.end_at,
            read_only: true,
          }));
          propose({ ...planData(s), events: [...s.events.filter((e) => e.id.startsWith("ev-user-")), ...google] }, { type: "calendar_change" });
        },

        importState: (json) => {
          const r = parseImportedState(json);
          if (!r.ok) return r;
          const v = r.value;
          set({
            ...initial(),
            anchor: v.anchor,
            now: v.now,
            settings: v.settings,
            assignments: v.assignments,
            subtasks: v.subtasks,
            sessions: v.sessions,
            events: v.events as CalendarEvent[],
            planVersion: v.planVersion,
          });
          get().generateWarnings();
          return { ok: true };
        },
      };
    },
    {
      name: "adaptive-planner-v4",
      storage: createJSONStorage(() => localStorage),
      // Rehydrated on the client after mount to avoid SSR hydration mismatches.
      skipHydration: true,
    },
  ),
);
