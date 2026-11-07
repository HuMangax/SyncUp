"use client";

import { useState } from "react";
import { CheckCircle2, ListTree, Pencil, Plus, Trash2 } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { RiskChip } from "@/components/RiskChip";
import { AssignmentForm } from "@/components/AssignmentForm";
import { BreakdownPanel } from "@/components/BreakdownPanel";
import { fmtDue, fmtHours } from "@/components/fmt";
import { primaryBtn } from "@/components/Modal";
import { remainingHours } from "@/lib/progress/remaining";
import type { Assignment, RiskEntry } from "@/lib/types";

export default function AssignmentsPage() {
  const { assignments, risk, settings } = usePlanner();
  const [editing, setEditing] = useState<Assignment | "new" | null>(null);
  const active = [...assignments].filter((a) => a.status !== "completed").sort((a, b) => a.due_at.localeCompare(b.due_at));
  const done = assignments.filter((a) => a.status === "completed");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Assignments</h1>
          <p className="mt-1 text-sm text-muted">Update progress here. The planner works out a new schedule for you to review.</p>
        </div>
        <button className={`${primaryBtn} inline-flex items-center gap-1.5`} onClick={() => setEditing("new")}>
          <Plus size={16} aria-hidden /> Add assignment
        </button>
      </div>

      {active.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">
          Nothing due. Add an assignment and the planner will find time for it around your week.
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {active.map((a) => (
          <AssignmentCard key={a.id} a={a} zone={settings.timezone} risk={risk.find((r) => r.assignment_id === a.id)} onEdit={() => setEditing(a)} />
        ))}
      </div>

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-muted">Finished</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {done.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-700" aria-hidden /> {a.title} <span className="text-muted">{a.course}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && <AssignmentForm existing={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const LEVEL = ["", "low", "medium", "high"];

function AssignmentCard({ a, zone, risk, onEdit }: { a: Assignment; zone: string; risk?: RiskEntry; onEdit: () => void }) {
  const { setProgress, deleteAssignment, completeAssignment, subtasks } = usePlanner();
  const [pct, setPct] = useState(String(a.percent_complete));
  const [rem, setRem] = useState(String(Math.round(remainingHours(a) * 100) / 100));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const mine = subtasks.filter((t) => t.assignment_id === a.id).sort((x, y) => x.order_idx - y.order_idx);
  const iconBtn = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-black/5 hover:text-foreground";

  return (
    <article className="flex flex-col rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            {a.course || "No course"} <span aria-hidden>/</span> {a.type}
          </p>
          <h2 className="truncate font-semibold">{a.title}</h2>
          <p className="text-sm text-muted">Due {fmtDue(a.due_at, zone)}</p>
        </div>
        {risk && <RiskChip level={risk.level} hoursShort={risk.hours_short} />}
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs text-muted">
          <span>{a.percent_complete}% done</span>
          <span>
            {fmtHours(remainingHours(a))} left of {a.estimate_hours} h{a.remaining_override != null ? " (set by you)" : ""}
          </span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-stone-200" role="progressbar" aria-valuenow={a.percent_complete} aria-valuemin={0} aria-valuemax={100} aria-label={`${a.title} progress`}>
          <div className="h-2 rounded-full bg-accent transition-[width] duration-500" style={{ width: `${a.percent_complete}%` }} />
        </div>
      </div>

      {mine.length > 0 && (
        <ol className="mt-3 space-y-0.5 text-xs text-muted">
          {mine.map((t) => (
            <li key={t.id} className="flex justify-between gap-2">
              <span className="truncate">{t.order_idx}. {t.title}</span>
              <span>{t.estimate_hours} h</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <form className="flex items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); setProgress(a.id, { percent: Number(pct) }); }}>
          <label htmlFor={`pct-${a.id}`} className="flex flex-col text-xs text-muted">
            Percent done
            <input id={`pct-${a.id}`} type="number" min={0} max={100} step={0.5} value={pct} onChange={(e) => setPct(e.target.value)} className="mt-0.5 w-20 rounded-md border border-border px-2 py-1 text-sm text-foreground" />
          </label>
          <button className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-black/5">Update</button>
        </form>
        <form className="flex items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); setProgress(a.id, { remaining: Number(rem) }); }}>
          <label htmlFor={`rem-${a.id}`} className="flex flex-col text-xs text-muted">
            Hours left
            <input id={`rem-${a.id}`} type="number" min={0} step={0.25} value={rem} onChange={(e) => setRem(e.target.value)} className="mt-0.5 w-20 rounded-md border border-border px-2 py-1 text-sm text-foreground" />
          </label>
          <button className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-black/5">Update</button>
        </form>
      </div>
      <p className="mt-2 text-xs text-muted">Priority {LEVEL[a.priority]}, difficulty {LEVEL[a.difficulty]}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-2">
        <button className={iconBtn} onClick={onEdit}><Pencil size={14} aria-hidden /> Edit</button>
        <button className={iconBtn} onClick={() => setBreakdown(true)}><ListTree size={14} aria-hidden /> {mine.length ? "Edit steps" : "Break down"}</button>
        <button className={iconBtn} onClick={() => completeAssignment(a.id)}><CheckCircle2 size={14} aria-hidden /> Mark finished</button>
        {confirmDelete ? (
          <span className="ml-auto flex items-center gap-1 text-xs">
            Delete {a.title}?
            <button className="rounded-md bg-red-700 px-2 py-1 font-semibold text-white hover:bg-red-800" onClick={() => deleteAssignment(a.id)}>Delete</button>
            <button className="rounded-md px-2 py-1 hover:bg-black/5" onClick={() => setConfirmDelete(false)}>Keep</button>
          </span>
        ) : (
          <button className={`${iconBtn} ml-auto hover:text-red-700`} onClick={() => setConfirmDelete(true)}><Trash2 size={14} aria-hidden /> Delete</button>
        )}
      </div>
      {breakdown && <BreakdownPanel assignment={a} onClose={() => setBreakdown(false)} />}
    </article>
  );
}
