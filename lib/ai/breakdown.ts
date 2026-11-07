import { z } from "zod";
import type { AssignmentType } from "@/lib/types";
import { cachedBreakdown } from "./cache";

/**
 * AI only breaks an assignment into ordered subtasks with hour hints. It never sees the
 * calendar and never returns dates or times. Every failure path ends in the template.
 * Framework-free: the route handler injects the actual model call.
 */

export const BreakdownRequest = z.object({
  title: z.string().trim().min(1).max(120),
  course: z.string().max(60).default(""),
  type: z.enum(["assignment", "project", "exam"]),
  description: z.string().max(8000).default(""),
  estimateHours: z.number().positive().max(200).optional(),
  useAi: z.boolean().default(true),
});
export type BreakdownRequest = z.infer<typeof BreakdownRequest>;

/** What we ask the model for (unknown keys are dropped by zod). */
export const ModelOutput = z.object({
  subtasks: z.array(
    z.object({
      title: z.string().trim().min(1).max(120),
      description: z.string().max(600).default(""),
      estimateHours: z.number(),
      order: z.number(),
    }),
  ),
  assumptions: z.array(z.string().max(300)).max(6).default([]),
});
export type ModelOutput = z.infer<typeof ModelOutput>;

export type BreakdownSubtask = { title: string; description: string; estimateHours: number; order: number };
export type BreakdownResult = {
  subtasks: BreakdownSubtask[];
  assumptions: string[];
  source: "ai" | "template" | "cache";
};

/** JSON schema sent as the structured-output format. Range rules are enforced by normalize(). */
export const MODEL_JSON_SCHEMA = {
  type: "object",
  properties: {
    subtasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          estimateHours: { type: "number" },
          order: { type: "integer" },
        },
        required: ["title", "description", "estimateHours", "order"],
        additionalProperties: false,
      },
    },
    assumptions: { type: "array", items: { type: "string" } },
  },
  required: ["subtasks", "assumptions"],
  additionalProperties: false,
} as const;

const TEMPLATES: Record<"assignment" | "exam", [string, number][]> = {
  assignment: [
    ["Research", 0.25],
    ["Outline", 0.1],
    ["First draft", 0.35],
    ["Editing", 0.2],
    ["Final review", 0.1],
  ],
  exam: [
    ["Review notes", 0.25],
    ["Practice problems", 0.4],
    ["Weak topics", 0.2],
    ["Mock exam", 0.15],
  ],
};

const half = (h: number) => Math.min(6, Math.max(0.5, Math.round(h * 2) / 2));

export function templateBreakdown(type: AssignmentType, estimateHours = 4): BreakdownResult {
  const rows = TEMPLATES[type === "exam" ? "exam" : "assignment"];
  return {
    subtasks: rows.map(([title, share], i) => ({
      title,
      description: "",
      estimateHours: Math.max(0.5, Math.round(estimateHours * share * 2) / 2),
      order: i + 1,
    })),
    assumptions: ["Standard template. Edit the steps and hours to fit this assignment."],
    source: "template",
  };
}

export class BreakdownValidationError extends Error {}

/**
 * Validate and tidy model output: 3 to 8 subtasks; 0.5 to 6 h each in 0.5 steps (clamped);
 * order renumbered 1..n; total within 25% of the student's estimate, else scaled and flagged.
 */
export function normalize(raw: unknown, estimateHours: number | undefined): Omit<BreakdownResult, "source"> {
  const parsed = ModelOutput.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new BreakdownValidationError(`Response did not match the schema at ${i.path.join(".") || "root"}: ${i.message}`);
  }
  const { subtasks, assumptions } = parsed.data;
  if (subtasks.length < 3 || subtasks.length > 8) {
    throw new BreakdownValidationError(`Return 3 to 8 subtasks (got ${subtasks.length}).`);
  }
  let rows = [...subtasks]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ title: s.title, description: s.description, estimateHours: half(s.estimateHours), order: i + 1 }));
  const notes = [...assumptions];

  if (estimateHours) {
    const total = rows.reduce((t, s) => t + s.estimateHours, 0);
    if (Math.abs(total - estimateHours) > 0.25 * estimateHours) {
      const k = estimateHours / total;
      rows = rows.map((s) => ({ ...s, estimateHours: half(s.estimateHours * k) }));
      notes.push(`Hours scaled from ${total} h to match your ${estimateHours} h estimate.`);
    }
  }
  return { subtasks: rows, assumptions: notes };
}

export type BreakdownDeps = {
  /** Calls the model; `retryNote` carries the previous validation error. Returns raw text. */
  callModel?: (retryNote?: string) => Promise<string>;
  timeoutMs?: number;
};

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

export async function breakdown(req: BreakdownRequest, deps: BreakdownDeps): Promise<BreakdownResult> {
  const fallback = () => templateBreakdown(req.type, req.estimateHours);
  if (!req.useAi) return fallback();
  const cached = cachedBreakdown(req.title);
  if (cached) return cached;
  if (!deps.callModel) return fallback();

  const timeoutMs = deps.timeoutMs ?? 8000;
  let note: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      text = await withTimeout(deps.callModel(note), timeoutMs);
    } catch {
      return fallback(); // timeout, network or API error
    }
    try {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new BreakdownValidationError("Response was not valid JSON.");
      }
      return { ...normalize(json, req.estimateHours), source: "ai" };
    } catch (e) {
      if (!(e instanceof BreakdownValidationError)) return fallback();
      note = e.message;
    }
  }
  return fallback();
}

/** Prompt for the model. Contains only the assignment text: no calendar, no dates. */
export function breakdownPrompt(req: BreakdownRequest, retryNote?: string): string {
  const lines = [
    "Break this university assignment into 3 to 8 ordered subtasks a student can work through.",
    "For each subtask give a short title, a one-sentence description, and an estimate in hours (0.5 to 6, in 0.5 steps).",
    req.estimateHours ? `The student expects the whole thing to take about ${req.estimateHours} hours; keep the total close to that.` : "",
    "Do not include dates, times or a schedule. List any assumptions you made.",
    "",
    `Type: ${req.type}`,
    `Course: ${req.course || "not given"}`,
    `Title: ${req.title}`,
    "Instructions from the student:",
    req.description || "(none provided)",
  ];
  if (retryNote) lines.push("", `Your previous answer was rejected: ${retryNote} Please fix it.`);
  return lines.filter((l) => l !== null).join("\n");
}
