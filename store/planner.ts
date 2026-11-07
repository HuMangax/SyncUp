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
import { createSeed, demoAnchorFor, placeholderSessions } from "@/lib/demo/seed";

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

  reset: () => void;
  advanceClock: (hours: number) => void;
};

const initial = (): Omit<PlannerStore, "reset" | "advanceClock"> => {
  const anchor = demoAnchorFor(new Date().toISOString());
  const seed = createSeed(anchor);
  return {
    anchor: seed.anchor,
    now: seed.now,
    settings: seed.settings,
    assignments: seed.assignments,
    subtasks: seed.subtasks,
    events: seed.events,
    // Phase 1 placeholder; replaced by schedule() in phase 2.
    sessions: placeholderSessions(seed.anchor, seed.settings.timezone),
    planVersion: 1,
    proposals: [],
    snapshots: [],
  };
};

export const usePlanner = create<PlannerStore>()(
  persist(
    (set) => ({
      ...initial(),
      reset: () => set(initial()),
      advanceClock: (hours) =>
        set((s) => ({ now: new Date(Date.parse(s.now) + hours * 3_600_000).toISOString() })),
    }),
    {
      name: "adaptive-planner-v1",
      storage: createJSONStorage(() => localStorage),
      // Rehydrated on the client after mount to avoid SSR hydration mismatches.
      skipHydration: true,
    },
  ),
);
