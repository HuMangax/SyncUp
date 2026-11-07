import type { Assignment, CalendarEvent, PlannerState, StudySession, Subtask, UserSettings } from "@/lib/types";
import { expandEvents } from "@/lib/calendar/simulated";

const DAY_MS = 86_400_000;

/** Assemble the pure scheduler input from stored data: expand recurring events over the horizon. */
export function toPlannerState(
  data: {
    settings: UserSettings;
    assignments: Assignment[];
    subtasks: Subtask[];
    sessions: StudySession[];
    events: CalendarEvent[];
    planVersion: number;
  },
  now: string,
): PlannerState {
  const t = Date.parse(now);
  const busy = expandEvents(
    data.events,
    { from: new Date(t - DAY_MS).toISOString(), to: new Date(t + 30 * DAY_MS).toISOString() },
    data.settings.timezone,
  );
  return {
    settings: data.settings,
    assignments: data.assignments,
    subtasks: data.subtasks,
    sessions: data.sessions,
    busy,
    plan_version: data.planVersion,
  };
}
