"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ListTree, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { RiskChip } from "@/components/RiskChip";
import { AssignmentForm } from "@/components/AssignmentForm";
import { BreakdownPanel } from "@/components/BreakdownPanel";
import { fmtDue, fmtHours } from "@/components/fmt";
import { remainingHours } from "@/lib/progress/remaining";
import type { Assignment, RiskEntry } from "@/lib/types";

export default function TasksPage() {
  const { assignments, risk, settings, now, reopenAssignment } = usePlanner();
  const [snack, setSnack] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(() => setSnack(null), 7000);
    return () => clearTimeout(t);
  }, [snack]);
  const [editing, setEditing] = useState<Assignment | "new" | null>(null);
  const [showDone, setShowDone] = useState(false);
  const zone = settings.timezone;
  const active = [...assignments].filter((a) => a.status !== "completed").sort((a, b) => a.due_at.localeCompare(b.due_at));
  const done = assignments.filter((a) => a.status === "completed");
  const weekOut = Date.parse(now) + 7 * 864e5;
  const groups = [
    { name: "Due this week", items: active.filter((a) => Date.parse(a.due_at) < weekOut) },
    { name: "Later", items: active.filter((a) => Date.parse(a.due_at) >= weekOut) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Tasks</h1>
          <p className="mt-1 text-base text-muted">{active.length} to do · {done.length} finished</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700" onClick={() => setEditing("new")}>
          <Plus size={18} aria-hidden /> Add task
        </button>
      </div>

      {active.length === 0 && (
        <div className="mt-6 rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-border">
          <p className="text-lg font-bold">All caught up</p>
          <p className="mt-1 text-muted">Add a task, or paste a syllabus on the Syllabus tab.</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.name} className="mt-6" aria-label={g.name}>
          <h2 className="mb-3 text-sm font-bold text-muted">{g.name}</h2>
          <ul className="space-y-3">
            {g.items.map((a) => (
              <TaskRow key={a.id} a={a} zone={zone} risk={risk.find((r) => r.assignment_id === a.id)} onEdit={() => setEditing(a)} onFinish={() => setSnack({ id: a.id, title: a.title })} />
            ))}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <section className="mt-8">
          <button onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="flex items-center gap-1.5 text-sm font-bold text-muted hover:text-foreground">
            <ChevronDown size={16} className={showDone ? "" : "-rotate-90"} aria-hidden /> Finished ({done.length})
          </button>
          {showDone && (
            <ul className="mt-3 space-y-2">
              {done.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-border">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-600 text-white"><Check size={16} aria-hidden /></span>
                  <span className="font-semibold text-muted line-through">{a.title}</span>
                  <span className="text-sm text-muted">{a.course}</span>
                  <button onClick={() => reopenAssignment(a.id)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">
                    <RotateCcw size={15} aria-hidden /> Undo
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {snack && (
        <div role="status" className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-blue-950 px-5 py-3.5 text-white shadow-xl md:bottom-6">
          <span className="min-w-0 flex-1 truncate font-semibold">Finished “{snack.title}”</span>
          <button onClick={() => { reopenAssignment(snack.id); setSnack(null); }} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-blue-900 hover:bg-blue-50">
            <RotateCcw size={14} aria-hidden /> Undo
          </button>
          <button onClick={() => setSnack(null)} aria-label="Dismiss" className="rounded p-1 hover:bg-white/10"><X size={16} /></button>
        </div>
      )}
      {editing && <AssignmentForm existing={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TaskRow({ a, zone, risk, onEdit, onFinish }: { a: Assignment; zone: string; risk?: RiskEntry; onEdit: () => void; onFinish: () => void }) {
  const { setProgress, deleteAssignment, completeAssignment, subtasks, toggleStep } = usePlanner();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(a.percent_complete);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const mine = subtasks.filter((t) => t.assignment_id === a.id).sort((x, y) => x.order_idx - y.order_idx);
  const act = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50";

  return (
    <li className="rounded-3xl bg-white shadow-sm ring-1 ring-border">
      <div className="flex items-center gap-4 p-4 md:p-5">
        <button
          onClick={() => {
            completeAssignment(a.id);
            onFinish();
          }}
          aria-label={`Mark ${a.title} finished`}
          title="Mark finished"
          className="group grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-blue-300 text-transparent hover:border-blue-600 hover:bg-blue-600 hover:text-white"
        >
          <Check size={18} aria-hidden />
        </button>
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-lg font-bold">{a.title}</span>
            {a.course && <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-900">{a.course}</span>}
          </span>
          <span className="mt-0.5 block text-sm text-muted">Due {fmtDue(a.due_at, zone)}</span>
          <span className="mt-2.5 flex items-center gap-3">
            <span className="h-2.5 flex-1 rounded-full bg-blue-100" role="progressbar" aria-label={`${a.title} progress`} aria-valuenow={a.percent_complete} aria-valuemin={0} aria-valuemax={100}>
              <span className="bar block h-2.5 rounded-full bg-blue-600" style={{ width: `${a.percent_complete}%` }} />
            </span>
            <span className="w-10 text-right text-sm font-bold">{a.percent_complete}%</span>
          </span>
        </button>
        <div className="hidden shrink-0 sm:block">{risk && risk.level !== "on_track" && <RiskChip level={risk.level} hoursShort={risk.hours_short} />}</div>
        <button onClick={() => setOpen((v) => !v)} aria-label={open ? "Hide details" : "Show details"} aria-expanded={open} className="rounded-lg p-2 text-muted hover:bg-blue-50">
          <ChevronDown size={20} className={open ? "rotate-180" : ""} aria-hidden />
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-border p-4 md:p-5">
          {risk && risk.level !== "on_track" && <div className="sm:hidden"><RiskChip level={risk.level} hoursShort={risk.hours_short} /></div>}
          {mine.length > 0 ? (
            <div className="rounded-2xl bg-blue-50 p-4">
              <p className="flex items-baseline justify-between text-sm font-semibold">
                Steps <span className="text-lg font-extrabold text-blue-700">{mine.filter((t) => t.percent_complete >= 100).length}/{mine.length}</span>
              </p>
              <ul className="mt-3 space-y-2">
                {mine.map((t) => {
                  const on = t.percent_complete >= 100;
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => toggleStep(t.id, !on)}
                        role="checkbox"
                        aria-checked={on}
                        className="flex w-full items-center gap-3 rounded-xl bg-white px-3.5 py-3 text-left shadow-sm ring-1 ring-border transition hover:ring-blue-300 active:scale-[0.99]"
                      >
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-colors ${on ? "pop border-blue-600 bg-blue-600 text-white" : "border-blue-300 text-transparent"}`}>
                          <Check size={16} aria-hidden />
                        </span>
                        <span className={`flex-1 font-semibold ${on ? "text-muted line-through" : ""}`}>{t.title}</span>
                        <span className="text-sm text-muted">{t.estimate_hours} h</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-sm text-muted">{fmtHours(remainingHours(a))} left of {a.estimate_hours} h</p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setProgress(a.id, { percent: pct }); }} className="rounded-2xl bg-blue-50 p-4">
              <label htmlFor={`pct-${a.id}`} className="flex items-baseline justify-between text-sm font-semibold">
                How much is done?
                <span className="text-lg font-extrabold text-blue-700">{pct}%</span>
              </label>
              <input id={`pct-${a.id}`} type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="mt-2 w-full accent-blue-600" />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-sm text-muted">{fmtHours(remainingHours(a))} left of {a.estimate_hours} h</span>
                <button disabled={pct === a.percent_complete} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40">Save</button>
              </div>
              <p className="mt-2 text-xs text-muted">Break it into steps to tick progress off instead.</p>
            </form>
          )}

          <div className="flex flex-wrap items-center gap-1">
            <button className={act} onClick={onEdit}><Pencil size={16} aria-hidden /> Edit</button>
            <button className={act} onClick={() => setBreakdown(true)}><ListTree size={16} aria-hidden /> {mine.length ? "Edit steps" : "Break into steps"}</button>
            {confirmDelete ? (
              <span className="ml-auto flex items-center gap-2 text-sm">
                Delete this?
                <button className="rounded-lg bg-red-700 px-3 py-2 font-bold text-white hover:bg-red-800" onClick={() => deleteAssignment(a.id)}>Delete</button>
                <button className="rounded-lg px-3 py-2 font-semibold hover:bg-blue-50" onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : (
              <button className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-red-50 hover:text-red-700" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} aria-hidden /> Delete
              </button>
            )}
          </div>
        </div>
      )}
      {breakdown && <BreakdownPanel assignment={a} onClose={() => setBreakdown(false)} />}
    </li>
  );
}
