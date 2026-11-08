"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { OctagonAlert, TriangleAlert, Wand2 } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { detectOverload } from "@/lib/feasibility/overload";

/** Predicts an unrealistic workload before the student falls behind, and offers real fixes. */
export function OverloadCard() {
  const router = useRouter();
  const { settings, assignments, subtasks, sessions, events, planVersion, now, applySuggestion, replan } = usePlanner();
  const o = useMemo(
    () => detectOverload({ settings, assignments, subtasks, sessions, events, planVersion }, now),
    [settings, assignments, subtasks, sessions, events, planVersion, now],
  );
  if (!o) return null;

  const over = o.level === "over";
  const pct = Math.min(100, (o.needed_hours / Math.max(o.available_hours, 0.1)) * 100);
  const names = o.assignment_ids.slice(0, 3).map((id) => assignments.find((a) => a.id === id)?.title).filter(Boolean);
  const span = o.weeks === 1 ? "this week" : "in the next two weeks";
  const go = (fn: () => void) => () => {
    fn();
    router.push("/preview");
  };

  return (
    <section
      role="alert"
      aria-labelledby="overload-h"
      className={`rise rounded-3xl p-6 shadow-sm ring-1 ${over ? "bg-red-50 text-red-950 ring-red-200" : "bg-amber-50 text-amber-950 ring-amber-200"}`}
    >
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${over ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950"}`}>
          {over ? <OctagonAlert size={22} aria-hidden /> : <TriangleAlert size={22} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="overload-h" className="text-xl font-bold">{over ? "Potential overload detected" : "Your week is nearly full"}</h2>
          <p className="mt-1 text-base">
            You have <b>{o.needed_hours} h</b> of coursework {span} but only <b>{o.available_hours} h</b> free to study.
          </p>
        </div>
      </div>

      <div className="mt-4" role="meter" aria-label="Coursework compared to free time" aria-valuemin={0} aria-valuemax={o.available_hours} aria-valuenow={Math.min(o.needed_hours, o.available_hours)}>
        <div className="flex justify-between text-xs font-bold">
          <span>{o.needed_hours} h needed</span>
          <span>{o.available_hours} h free</span>
        </div>
        <div className="relative mt-1 h-3.5 overflow-hidden rounded-full bg-white/80">
          <div className="bar h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, (o.available_hours / Math.max(o.needed_hours, o.available_hours)) * 100)}%` }} />
          {over && (
            <div className="absolute inset-y-0 right-0 bg-red-500" style={{ width: `${Math.max(0, 100 - (o.available_hours / o.needed_hours) * 100)}%` }} aria-hidden />
          )}
        </div>
        <p className="mt-1.5 text-sm">
          {over ? `${o.short_hours} h short` : `${Math.round(pct)}% of your free time`}
          {names.length > 0 && <> · {names.join(", ")}</>}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={go(replan)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          <Wand2 size={16} aria-hidden /> Rebalance my week
        </button>
        {o.suggestions.map((sg) => (
          <button key={sg.id} onClick={go(() => applySuggestion(sg))} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold shadow-sm ring-1 ring-black/10 hover:bg-blue-50">
            {sg.label}
          </button>
        ))}
      </div>
    </section>
  );
}
