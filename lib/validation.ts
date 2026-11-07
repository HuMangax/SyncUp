import { z } from "zod";
import type { Assignment, CalendarEvent } from "@/lib/types";
import { localToUtc, parseHM, weekdayOf } from "@/lib/time/slots";

/** All external input (forms, imported JSON, API bodies) is validated here. */

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
const level = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const AssignmentInput = z.object({
  title: z.string().trim().min(1, "Give it a name").max(120),
  course: z.string().trim().max(60).default(""),
  type: z.enum(["assignment", "project", "exam"]),
  /** Local wall-clock "YYYY-MM-DDTHH:mm" in the user's zone. */
  due_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a due date and time"),
  estimate_hours: z.number().min(0.5, "At least 0.5 h").max(200),
  difficulty: level,
  priority: level,
  description: z.string().max(8000).default(""),
  ai_enabled: z.boolean().nullable().default(null),
});
export type AssignmentInput = z.infer<typeof AssignmentInput>;

export function assignmentFromInput(input: AssignmentInput, zone: string, id: string, existing?: Assignment): Assignment {
  const [date, time] = input.due_local.split("T");
  return {
    id,
    title: input.title,
    course: input.course,
    type: input.type,
    due_at: localToUtc(date, time, zone),
    estimate_hours: input.estimate_hours,
    difficulty: input.difficulty,
    priority: input.priority,
    description: input.description,
    ai_enabled: input.ai_enabled,
    percent_complete: existing?.percent_complete ?? 0,
    remaining_override: existing?.remaining_override ?? null,
    status: existing?.status ?? "active",
  };
}

export const SettingsInput = z
  .object({
    timezone: z.string().min(1),
    wake_time: hm,
    bed_time: hm,
    wind_down_min: z.number().int().min(0).max(120),
    preferred_windows: z.array(z.object({ start: hm, end: hm })).max(6),
    max_hours_per_day: z.number().min(0.5, "At least 0.5 h").max(16),
    session_min: z.number().int().min(15).max(240),
    session_target: z.number().int().min(15).max(240),
    session_max: z.number().int().min(15).max(300),
    break_min: z.number().int().min(0).max(60),
    free_days: z.array(z.number().int().min(0).max(6)).max(6, "Keep at least one study day"),
    ai_default: z.boolean(),
  })
  .refine((s) => s.session_min <= s.session_target && s.session_target <= s.session_max, {
    message: "Session lengths must go shortest ≤ usual ≤ longest",
    path: ["session_target"],
  })
  .refine((s) => parseHM(s.bed_time) !== parseHM(s.wake_time), { message: "Bedtime and wake time can't match", path: ["bed_time"] });

export const EventInput = z
  .object({
    title: z.string().trim().min(1, "Give it a name").max(80),
    kind: z.enum(["class", "work", "social", "other"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start: hm,
    end: hm,
    weekly: z.boolean(),
  })
  .refine((e) => parseHM(e.end) > parseHM(e.start), { message: "End must be after start", path: ["end"] });
export type EventInput = z.infer<typeof EventInput>;

export function eventFromInput(input: EventInput, zone: string, id: string): CalendarEvent {
  return {
    id,
    source: "simulated",
    title: input.title,
    kind: input.kind,
    start_at: localToUtc(input.date, input.start, zone),
    end_at: localToUtc(input.date, input.end, zone),
    rule: input.weekly ? { days: [weekdayOf(input.date)], start: input.start, end: input.end, from: input.date } : undefined,
    read_only: true,
  };
}

// ---------- Import / export ----------

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Not a date");
const AssignmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  course: z.string(),
  type: z.enum(["assignment", "project", "exam"]),
  due_at: iso,
  estimate_hours: z.number().positive(),
  difficulty: level,
  priority: level,
  description: z.string(),
  percent_complete: z.number().min(0).max(100),
  remaining_override: z.number().min(0).nullable(),
  ai_enabled: z.boolean().nullable(),
  status: z.enum(["active", "completed", "at_risk"]),
});
const SessionSchema = z.object({
  id: z.string(),
  assignment_id: z.string(),
  subtask_id: z.string().nullable(),
  start_at: iso,
  end_at: iso,
  status: z.enum(["scheduled", "completed", "partial", "missed", "cancelled"]),
  minutes_done: z.number().min(0),
  pinned: z.boolean(),
  plan_version: z.number().int(),
  external_id: z.string().optional(),
});
const EventSchema = z.object({
  id: z.string(),
  source: z.enum(["simulated", "google"]),
  external_id: z.string().optional(),
  title: z.string(),
  kind: z.enum(["class", "work", "social", "other"]),
  start_at: iso,
  end_at: iso,
  rule: z
    .object({ days: z.array(z.number().int().min(0).max(6)), start: hm, end: hm, from: z.string().optional(), until: z.string().optional() })
    .optional(),
  read_only: z.literal(true),
});
const SubtaskSchema = z.object({
  id: z.string(),
  assignment_id: z.string(),
  title: z.string(),
  order_idx: z.number().int(),
  estimate_hours: z.number().positive(),
  percent_complete: z.number().min(0).max(100),
  source: z.enum(["ai", "template", "manual"]),
});

export const ExportedState = z.object({
  version: z.literal(1),
  now: iso,
  anchor: z.string(),
  settings: SettingsInput,
  assignments: z.array(AssignmentSchema),
  subtasks: z.array(SubtaskSchema),
  sessions: z.array(SessionSchema),
  events: z.array(EventSchema),
  planVersion: z.number().int(),
});
export type ExportedState = z.infer<typeof ExportedState>;

export function parseImportedState(json: string): { ok: true; value: ExportedState } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const r = ExportedState.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `That file doesn't look like a planner export (${first.path.join(".") || "root"}: ${first.message}).` };
  }
  return { ok: true, value: r.data };
}
