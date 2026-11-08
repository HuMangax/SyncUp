/**
 * Core entities. All timestamps are ISO-8601 UTC strings ("2026-11-09T17:00:00.000Z").
 * Convert to the user's IANA zone only for display and recurrence expansion.
 * Scheduler code works on integer slot indexes (15-minute grid), see lib/time/slots.ts.
 */

export type ISO = string;
/** Integer count of 15-minute slots since the Unix epoch (UTC). */
export type Slot = number;

// ---------- Settings ----------

export type PreferredWindow = {
  /** Local wall-clock "HH:mm" */
  start: string;
  end: string;
};

export type UserSettings = {
  timezone: string; // IANA
  wake_time: string; // "HH:mm" local
  bed_time: string; // "HH:mm" local
  wind_down_min: number;
  preferred_windows: PreferredWindow[]; // soft
  max_hours_per_day: number; // hard
  session_min: number; // minutes, hard
  session_target: number;
  session_max: number;
  break_min: number; // minutes reserved after each session
  /** 0 = Sunday ... 6 = Saturday (local). Hard. */
  free_days: number[];
  ai_default: boolean;
};

// ---------- Assignments ----------

export type AssignmentType = "assignment" | "project" | "exam";
export type AssignmentStatus = "active" | "completed" | "at_risk";
export type Level = 1 | 2 | 3;

export type Assignment = {
  id: string;
  title: string;
  course: string;
  type: AssignmentType;
  due_at: ISO;
  estimate_hours: number;
  difficulty: Level;
  priority: Level;
  description: string;
  percent_complete: number; // 0..100
  /** When set, wins over the percent-derived value until percent is next edited. */
  remaining_override: number | null;
  /** null = follow the global default */
  ai_enabled: boolean | null;
  status: AssignmentStatus;
};

export type SubtaskSource = "ai" | "template" | "manual";

export type Subtask = {
  id: string;
  assignment_id: string;
  title: string;
  order_idx: number;
  estimate_hours: number;
  percent_complete: number;
  source: SubtaskSource;
};

// ---------- Calendar ----------

export type EventKind = "class" | "work" | "social" | "other";

/** Weekly recurrence expressed in local wall-clock time so a 9:00 class stays 9:00 across DST. */
export type WeeklyRule = {
  /** 0 = Sunday ... 6 = Saturday (local) */
  days: number[];
  /** Local "HH:mm" */
  start: string;
  end: string;
  /** Inclusive local dates "YYYY-MM-DD". Optional bounds. */
  from?: string;
  until?: string;
};

export type CalendarEvent = {
  id: string;
  source: "simulated" | "google";
  external_id?: string;
  title: string;
  kind: EventKind;
  /** Concrete event, or the first occurrence's span when `rule` is set. */
  start_at: ISO;
  end_at: ISO;
  rule?: WeeklyRule;
  /** Start times of occurrences the student cancelled (a lecture that was called off). The event itself is never changed. */
  skip?: ISO[];
  /** Always true. Existing events are never modified or deleted by the planner. */
  read_only: true;
};

/** A concrete, expanded occurrence of a CalendarEvent. */
export type EventOccurrence = {
  event_id: string;
  title: string;
  kind: EventKind;
  start_at: ISO;
  end_at: ISO;
  /** Only present when the caller asked for cancelled occurrences too. */
  cancelled?: boolean;
};

// ---------- Sessions ----------

export type SessionStatus =
  | "scheduled"
  | "completed"
  | "partial"
  | "missed"
  | "cancelled";

export type StudySession = {
  id: string;
  assignment_id: string;
  subtask_id: string | null;
  start_at: ISO;
  end_at: ISO;
  status: SessionStatus;
  minutes_done: number;
  pinned: boolean;
  plan_version: number;
  external_id?: string;
};

// ---------- Plan ----------

export type WarningKind =
  | "deadline_risk" // red
  | "tight" // yellow
  | "overlap" // yellow
  | "overloaded_day" // yellow
  | "shortfall_week"; // red or yellow

export type Severity = "red" | "yellow";

export type Suggestion = {
  id: string;
  label: string;
  /** Hours of the shortfall this what-if run would recover. */
  recovers_hours: number;
  of_hours: number;
  action:
    | { type: "raise_max_hours"; by: number }
    | { type: "open_free_day"; day: number }
    | { type: "longer_sessions"; max_minutes: number }
    | { type: "show_open_slots" }
    | { type: "trim_scope"; assignment_id: string; hours: number };
};

export type Warning = {
  kind: WarningKind;
  severity: Severity;
  assignment_id?: string;
  /** Local date "YYYY-MM-DD" for day-level warnings. */
  day?: string;
  hours_short: number;
  message: string;
  suggestions: Suggestion[];
};

export type DayLoad = {
  /** Local date "YYYY-MM-DD" */
  day: string;
  planned_hours: number;
  capacity_hours: number;
};

export type Plan = {
  /** Newly placed sessions only (locked sessions are inputs, not outputs). */
  sessions: StudySession[];
  /** Hours that could not be placed, per assignment id. */
  unplaced: Record<string, number>;
  loadByDay: DayLoad[];
  warnings: Warning[];
};

/** Everything schedule() needs. Pure data, no I/O. */
export type PlannerState = {
  settings: UserSettings;
  assignments: Assignment[];
  subtasks: Subtask[];
  /** Existing sessions: locked ones are treated as occupied; future scheduled ones are replaced. */
  sessions: StudySession[];
  /** Expanded busy intervals covering the planning horizon. */
  busy: EventOccurrence[];
  plan_version: number;
};

/** The stored, accepted state that proposals are built from. */
export type PlanData = {
  settings: UserSettings;
  assignments: Assignment[];
  subtasks: Subtask[];
  sessions: StudySession[];
  events: CalendarEvent[];
  planVersion: number;
};

// ---------- Proposals / Diff ----------

export type ReasonCode =
  | "MISSED_RETURNED"
  | "BEHIND_PACE"
  | "AHEAD_PACE"
  | "CONFLICT"
  | "DEADLINE_PROTECTION"
  | "REBALANCE";

export type DiffKind = "kept" | "moved" | "added" | "removed";

export type DiffEntry = {
  kind: DiffKind;
  assignment_id: string;
  /** Session id before (kept/moved/removed). */
  before?: StudySession;
  /** Session after (kept/moved/added). */
  after?: StudySession;
  reason?: ReasonCode;
  /** Human sentence: "Moved because Marketing paper has 6 h left after Monday was missed." */
  explanation?: string;
};

export type RiskLevel = "on_track" | "tight" | "at_risk";

export type RiskEntry = {
  assignment_id: string;
  level: RiskLevel;
  hours_short: number;
  slack_pct: number;
};

export type ProposalTrigger =
  | { type: "session_status"; session_id: string; status: SessionStatus; minutes_done?: number }
  | { type: "progress"; assignment_id: string; percent?: number; remaining_hours?: number }
  | { type: "settings" }
  | { type: "calendar_change" }
  | { type: "assignment_change" }
  | { type: "clock" };

export type ProposalState = "pending" | "accepted" | "rejected" | "superseded";

export type Proposal = {
  id: string;
  created_at: ISO;
  trigger: ProposalTrigger;
  /** Triggers of pending proposals this one superseded, newest first. Their effects are included. */
  prior_triggers: ProposalTrigger[];
  base_version: number;
  new_sessions: StudySession[];
  diff: DiffEntry[];
  risk: RiskEntry[];
  warnings: Warning[];
  state: ProposalState;
};

export type PlanSnapshot = {
  version: number;
  sessions: StudySession[];
  /** Assignment progress at the time, so undo restores it too. */
  assignments: Assignment[];
  created_at: ISO;
};
