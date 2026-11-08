"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type TextSize = "normal" | "large" | "xlarge";

type A11y = {
  textSize: TextSize;
  highContrast: boolean;
  /** null = follow the device setting */
  reduceMotion: boolean | null;
  set: (patch: Partial<Pick<A11y, "textSize" | "highContrast" | "reduceMotion">>) => void;
  reset: () => void;
};

/** Display preferences. Kept on this device only; they never touch the plan or the scheduler. */
export const useA11y = create<A11y>()(
  persist(
    (set) => ({
      textSize: "normal",
      highContrast: false,
      reduceMotion: null,
      set: (patch) => set(patch),
      reset: () => set({ textSize: "normal", highContrast: false, reduceMotion: null }),
    }),
    { name: "planner-a11y-v1", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);
