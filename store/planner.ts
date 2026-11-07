"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Assignment,
  CalendarEvent,
  PlanSnapshot,
  Proposal,
  StudySession,
  Subtask,
  UserSettings,
} from "@/lib/types";
import { createSeed, demoAnchorFor } from "@/lib/demo/seed";
import { schedule, isLocked } from "@/lib/scheduler";
import { toPlannerState } from "@/lib/planner";
import { slotCeil } from "@/lib/time/slots";

export type PlannerStore = {
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
  snapshots: PlanSnapshot[];

  /** Unplaced hours per assignment from the last generated plan. */
  unplaced: Record<string, number>;

  reset: () => void;
  advanceClock: (hours: number) => void;
  /** First plan only (no current plan to diff against). Later changes go through proposals. */
  generatePlan: () => void;
};

const initial = (): Omit<PlannerStore, "reset" | "advanceClock" | "generatePlan"> => {
  const anchor = demoAnchorFor(new Date().toISOString());
  const seed = createSeed(anchor);
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
    snapshots: [],
    unplaced: {},
  };
};

export const usePlanner = create<PlannerStore>()(
  persist(
    (set, get) => ({
      ...initial(),
      generatePlan: () => {
        const s = get();
        const plan = schedule(toPlannerState(s, s.now), s.now);
        // Keep history and locked sessions; only future movable sessions are replaced.
        const nowSlot = slotCeil(s.now);
        const kept = s.sessions.filter((x) => !(x.status === "scheduled" && !isLocked(x, nowSlot)));
        set({ sessions: [...kept, ...plan.sessions], unplaced: plan.unplaced, planVersion: s.planVersion + 1 });
      },
      reset: () => set(initial()),
      advanceClock: (hours) =>
        set((s) => ({ now: new Date(Date.parse(s.now) + hours * 3_600_000).toISOString() })),
    }),
    {
      name: "adaptive-planner-v2",
      storage: createJSONStorage(() => localStorage),
      // Rehydrated on the client after mount to avoid SSR hydration mismatches.
      skipHydration: true,
    },
  ),
);
