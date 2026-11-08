import type { Assignment, CalendarEvent, PlanData, StudySession, Subtask, UserSettings } from "@/lib/types";

/**
 * Mapping between the app's stored state and Supabase rows (see supabase/migrations).
 * Every row carries user_id; RLS restricts each table to its owner.
 */
export type StoredState = PlanData & { now: string; anchor: string };

export type Rows = {
  app_state: { user_id: string; now: string; anchor: string; plan_version: number };
  user_settings: UserSettings & { user_id: string };
  assignments: (Assignment & { user_id: string })[];
  subtasks: (Subtask & { user_id: string })[];
  calendar_events: (Omit<CalendarEvent, "rule" | "external_id" | "skip"> & { user_id: string; rule: CalendarEvent["rule"] | null; external_id: string | null; skip: string[] | null })[];
  study_sessions: (Omit<StudySession, "external_id"> & { user_id: string; external_id: string | null })[];
};

const strip = <T extends { user_id: string }>(row: T): Omit<T, "user_id"> => {
  const rest: Partial<T> = { ...row };
  delete rest.user_id;
  return rest as Omit<T, "user_id">;
};

export function toRows(s: StoredState, userId: string): Rows {
  const u = { user_id: userId };
  return {
    app_state: { ...u, now: s.now, anchor: s.anchor, plan_version: s.planVersion },
    user_settings: { ...u, ...s.settings },
    assignments: s.assignments.map((a) => ({ ...u, ...a })),
    subtasks: s.subtasks.map((t) => ({ ...u, ...t })),
    calendar_events: s.events.map((e) => ({ ...u, ...e, rule: e.rule ?? null, external_id: e.external_id ?? null, skip: e.skip?.length ? e.skip : null })),
    study_sessions: s.sessions.map((x) => ({ ...u, ...x, external_id: x.external_id ?? null })),
  };
}

export function fromRows(r: Rows): StoredState {
  return {
    now: r.app_state.now,
    anchor: r.app_state.anchor,
    planVersion: r.app_state.plan_version,
    settings: strip(r.user_settings),
    assignments: r.assignments.map(strip),
    subtasks: r.subtasks.map(strip),
    events: r.calendar_events.map((row) => {
      const { rule, external_id, skip, ...e } = strip(row);
      return { ...e, ...(rule ? { rule } : {}), ...(external_id ? { external_id } : {}), ...(skip?.length ? { skip } : {}) } as CalendarEvent;
    }),
    sessions: r.study_sessions.map((row) => {
      const { external_id, ...x } = strip(row);
      return { ...x, ...(external_id ? { external_id } : {}) };
    }),
  };
}
