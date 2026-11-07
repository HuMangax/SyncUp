"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { AssignmentInput } from "@/lib/validation";
import type { Assignment } from "@/lib/types";
import { usePlanner } from "@/store/planner";
import { Modal, field, labelCls, primaryBtn, secondaryBtn } from "./Modal";

type Draft = {
  title: string;
  course: string;
  type: Assignment["type"];
  due_local: string;
  estimate_hours: string;
  difficulty: string;
  priority: string;
  description: string;
  ai: "default" | "on" | "off";
};

export function AssignmentForm({ existing, onClose }: { existing?: Assignment; onClose: () => void }) {
  const { settings, now, addAssignment, updateAssignment } = usePlanner();
  const zone = settings.timezone;
  const [d, setD] = useState<Draft>(() => ({
    title: existing?.title ?? "",
    course: existing?.course ?? "",
    type: existing?.type ?? "assignment",
    due_local: DateTime.fromISO(existing?.due_at ?? now, { zone: "utc" })
      .setZone(zone)
      .plus(existing ? {} : { days: 7 })
      .set(existing ? {} : { hour: 17, minute: 0 })
      .toFormat("yyyy-LL-dd'T'HH:mm"),
    estimate_hours: String(existing?.estimate_hours ?? 4),
    difficulty: String(existing?.difficulty ?? 2),
    priority: String(existing?.priority ?? 2),
    description: existing?.description ?? "",
    ai: existing?.ai_enabled == null ? "default" : existing.ai_enabled ? "on" : "off",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = AssignmentInput.safeParse({
      ...d,
      estimate_hours: Number(d.estimate_hours),
      difficulty: Number(d.difficulty),
      priority: Number(d.priority),
      ai_enabled: d.ai === "default" ? null : d.ai === "on",
    });
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    if (existing) updateAssignment(existing.id, r.data);
    else addAssignment(r.data);
    onClose();
  };

  const err = (k: string) =>
    errors[k] ? (
      <p id={`${k}-err`} className="mt-1 text-xs text-red-700">
        {errors[k]}
      </p>
    ) : null;

  return (
    <Modal title={existing ? `Edit ${existing.title}` : "Add an assignment"} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2" noValidate>
        <label className={`${labelCls} md:col-span-2`}>
          Name
          <input className={field} value={d.title} onChange={(e) => set("title", e.target.value)} aria-invalid={!!errors.title} aria-describedby={errors.title ? "title-err" : undefined} />
          {err("title")}
        </label>
        <label className={labelCls}>
          Course
          <input className={field} value={d.course} onChange={(e) => set("course", e.target.value)} placeholder="e.g. MKTG 301" />
        </label>
        <label className={labelCls}>
          Type
          <select className={field} value={d.type} onChange={(e) => set("type", e.target.value as Draft["type"])}>
            <option value="assignment">Assignment</option>
            <option value="project">Project</option>
            <option value="exam">Exam</option>
          </select>
        </label>
        <label className={labelCls}>
          Due
          <input type="datetime-local" className={field} value={d.due_local} onChange={(e) => set("due_local", e.target.value)} aria-invalid={!!errors.due_local} />
          {err("due_local")}
        </label>
        <label className={labelCls}>
          Hours you expect it to take
          <input type="number" min={0.5} step={0.5} className={field} value={d.estimate_hours} onChange={(e) => set("estimate_hours", e.target.value)} aria-invalid={!!errors.estimate_hours} />
          {err("estimate_hours")}
        </label>
        <label className={labelCls}>
          Difficulty
          <select className={field} value={d.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
            <option value="1">Easy</option>
            <option value="2">Medium (adds 10% buffer)</option>
            <option value="3">Hard (adds 20% buffer)</option>
          </select>
        </label>
        <label className={labelCls}>
          Priority
          <select className={field} value={d.priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="1">Low</option>
            <option value="2">Medium</option>
            <option value="3">High (gets time first when it’s tight)</option>
          </select>
        </label>
        <label className={`${labelCls} md:col-span-2`}>
          Instructions or notes
          <textarea rows={4} className={field} value={d.description} onChange={(e) => set("description", e.target.value)} placeholder="Paste the assignment brief to get a suggested breakdown." />
        </label>
        <label className={labelCls}>
          Suggested breakdown
          <select className={field} value={d.ai} onChange={(e) => set("ai", e.target.value as Draft["ai"])}>
            <option value="default">Use my default ({settings.ai_default ? "AI on" : "AI off"})</option>
            <option value="on">AI on for this one</option>
            <option value="off">AI off: use a standard template</option>
          </select>
        </label>
        <div className="flex items-end justify-end gap-2 md:col-span-1">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button className={primaryBtn}>{existing ? "Save changes" : "Add assignment"}</button>
        </div>
      </form>
    </Modal>
  );
}
