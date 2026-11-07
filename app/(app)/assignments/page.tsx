"use client";

import { useState } from "react";
import { usePlanner } from "@/store/planner";
import { RiskChip } from "@/components/RiskChip";
import { fmtDue, fmtHours } from "@/components/fmt";
import { remainingHours } from "@/lib/progress/remaining";
import type { Assignment } from "@/lib/types";

export default function AssignmentsPage() {
  const { assignments, risk, settings } = usePlanner();
  const sorted = [...assignments].sort((a, b) => a.due_at.localeCompare(b.due_at));
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold tracking-tight">Assignments</h1>
      <p className="mt-1 text-sm text-muted">Update your progress and the planner proposes a new schedule for you to review.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {sorted.map((a) => (
          <AssignmentCard key={a.id} a={a} zone={settings.timezone} risk={risk.find((r) => r.assignment_id === a.id)} />
        ))}
      </div>
    </div>
  );
}

const LEVEL = ["", "Low", "Medium", "High"];

function AssignmentCard({ a, zone, risk }: { a: Assignment; zone: string; risk?: { level: "on_track" | "tight" | "at_risk"; hours_short: number } }) {
  const setProgress = usePlanner((s) => s.setProgress);
  const [pct, setPct] = useState(String(a.percent_complete));
  const [rem, setRem] = useState(String(Math.round(remainingHours(a) * 100) / 100));
  const pctId = `pct-${a.id}`;
  const remId = `rem-${a.id}`;

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{a.course} · {a.type}</p>
          <h2 className="font-semibold">{a.title}</h2>
          <p className="text-sm text-muted">Due {fmtDue(a.due_at, zone)}</p>
        </div>
        {a.status === "completed" ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Done</span>
        ) : (
          risk && <RiskChip level={risk.level} hoursShort={risk.hours_short} />
        )}
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs text-muted">
          <span>{a.percent_complete}% complete</span>
          <span>{fmtHours(remainingHours(a))} left of {a.estimate_hours} h{a.remaining_override != null ? " (set manually)" : ""}</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-stone-200" role="progressbar" aria-valuenow={a.percent_complete} aria-valuemin={0} aria-valuemax={100} aria-label={`${a.title} progress`}>
          <div className="h-2 rounded-full bg-accent" style={{ width: `${a.percent_complete}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <form
          className="flex items-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            setProgress(a.id, { percent: Number(pct) });
          }}
        >
          <label htmlFor={pctId} className="flex flex-col text-xs text-muted">
            Percent done
            <input id={pctId} type="number" min={0} max={100} step={0.5} value={pct} onChange={(e) => setPct(e.target.value)} className="mt-0.5 w-20 rounded-md border border-border px-2 py-1 text-sm text-foreground" />
          </label>
          <button className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-black/5">Update</button>
        </form>
        <form
          className="flex items-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            setProgress(a.id, { remaining: Number(rem) });
          }}
        >
          <label htmlFor={remId} className="flex flex-col text-xs text-muted">
            Hours left
            <input id={remId} type="number" min={0} step={0.25} value={rem} onChange={(e) => setRem(e.target.value)} className="mt-0.5 w-20 rounded-md border border-border px-2 py-1 text-sm text-foreground" />
          </label>
          <button className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-black/5">Update</button>
        </form>
        <span className="ml-auto text-xs text-muted">Priority {LEVEL[a.priority]} · Difficulty {LEVEL[a.difficulty]}</span>
      </div>
    </article>
  );
}
