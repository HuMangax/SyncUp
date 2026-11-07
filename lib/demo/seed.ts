import type {
  Assignment,
  CalendarEvent,
  Subtask,
  StudySession,
  UserSettings,
} from "@/lib/types";
import { addDays, localDateKey, localToUtc, mondayOnOrBefore, weekdayOf } from "@/lib/time/slots";

export const DEMO_ZONE = "America/Vancouver";

export type SeedData = {
  anchor: string; // local "YYYY-MM-DD" of the demo Monday
  /** Simulated clock start: anchor Monday 08:00 local, as UTC ISO. */
  now: string;
  settings: UserSettings;
  assignments: Assignment[];
  subtasks: Subtask[];
  events: CalendarEvent[];
  sessions: StudySession[];
};

/** The coming Monday: today if today is Monday, otherwise the next one. */
export function demoAnchorFor(todayIso: string, zone = DEMO_ZONE): string {
  const today = localDateKey(todayIso, zone);
  const wd = weekdayOf(today);
  const daysAhead = wd === 1 ? 0 : (8 - wd) % 7;
  return addDays(today, daysAhead);
}

export const defaultSettings = (zone = DEMO_ZONE): UserSettings => ({
  timezone: zone,
  wake_time: "07:30",
  bed_time: "23:30",
  wind_down_min: 30,
  preferred_windows: [{ start: "18:00", end: "22:00" }],
  max_hours_per_day: 6,
  session_min: 30,
  session_target: 90,
  session_max: 120,
  break_min: 15,
  free_days: [0], // Sunday
  ai_default: true,
});

/**
 * All dates are offsets (in local days) from the anchor Monday. Nothing is hard-coded,
 * so the demo never goes stale.
 */
export function createSeed(anchorDate: string, zone = DEMO_ZONE): SeedData {
  const anchor = mondayOnOrBefore(anchorDate);
  const at = (dayOffset: number, hm: string) => localToUtc(addDays(anchor, dayOffset), hm, zone);
  const horizonStart = anchor;
  const until = addDays(anchor, 35);

  const recurring = (
    id: string,
    title: string,
    kind: CalendarEvent["kind"],
    days: number[],
    start: string,
    end: string,
  ): CalendarEvent => ({
    id,
    source: "simulated",
    title,
    kind,
    start_at: at(0, start),
    end_at: at(0, end),
    rule: { days, start, end, from: horizonStart, until },
    read_only: true,
  });

  const events: CalendarEvent[] = [
    recurring("ev-mkt-lecture", "Marketing lecture", "class", [1, 3, 5], "09:00", "10:30"),
    recurring("ev-stat-lecture", "Statistics lecture", "class", [2, 4], "13:00", "14:30"),
    recurring("ev-ops-seminar", "Operations seminar", "class", [3], "14:00", "15:30"),
    recurring("ev-job-weekday", "Part-time job", "work", [2], "17:00", "21:00"),
    recurring("ev-job-sat", "Part-time job", "work", [6], "10:00", "16:00"),
    {
      id: "ev-dinner",
      source: "simulated",
      title: "Dinner with friends",
      kind: "social",
      start_at: at(3, "18:30"), // Thursday of week 1
      end_at: at(3, "20:30"),
      read_only: true,
    },
  ];

  // Deadlines follow the spec order (Nov 20, 23, 25) as offsets from the anchor Monday.
  const assignments: Assignment[] = [
    {
      id: "a-marketing",
      title: "Marketing paper",
      course: "MKTG 301",
      type: "assignment",
      due_at: at(11, "17:00"), // Friday of week 2
      estimate_hours: 8,
      difficulty: 2,
      priority: 2,
      description: "Case-based paper on brand positioning for a consumer product.",
      percent_complete: 0,
      remaining_override: null,
      ai_enabled: null,
      status: "active",
    },
    {
      id: "a-stats",
      title: "Statistics midterm",
      course: "STAT 252",
      type: "exam",
      due_at: at(14, "13:00"), // Monday of week 3
      estimate_hours: 12,
      difficulty: 3,
      priority: 3,
      description: "Midterm covering hypothesis testing, regression and ANOVA.",
      percent_complete: 0,
      remaining_override: null,
      ai_enabled: null,
      status: "active",
    },
    {
      id: "a-operations",
      title: "Operations case",
      course: "COMM 393",
      type: "assignment",
      due_at: at(16, "17:00"), // Wednesday of week 3
      estimate_hours: 5,
      difficulty: 2,
      priority: 1,
      description: "Analyze a supply-chain case and recommend an inventory policy.",
      percent_complete: 0,
      remaining_override: null,
      ai_enabled: null,
      status: "active",
    },
  ];

  return {
    anchor,
    now: at(0, "08:00"),
    settings: defaultSettings(zone),
    assignments,
    subtasks: [],
    events,
    // No plan yet: the student presses "Generate plan" (presenter step 3).
    sessions: [],
  };
}
