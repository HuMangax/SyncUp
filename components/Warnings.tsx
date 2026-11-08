"use client";

import { AlertTriangle, OctagonAlert } from "lucide-react";
import type { Warning } from "@/lib/types";
import { usePlanner } from "@/store/planner";

/** Red warnings first, with what-if suggestion buttons that open a real proposal. */
export function Warnings({ warnings, compact = false }: { warnings: Warning[]; compact?: boolean }) {
  const applySuggestion = usePlanner((s) => s.applySuggestion);
  if (warnings.length === 0) return null;
  const red = warnings.filter((w) => w.severity === "red");
  const yellow = warnings.filter((w) => w.severity === "yellow");
  // Suggestions are shared across red warnings; show them once.
  const suggestions = red.find((w) => w.suggestions.length > 0)?.suggestions ?? [];

  return (
    <div className="space-y-2">
      {red.length > 0 && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-base text-red-900">
          {red.map((w, i) => (
            <p key={i} className="flex items-start gap-2">
              <OctagonAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">Deadline at risk.</span> {w.message}
              </span>
            </p>
          ))}
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 pl-6">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => applySuggestion(s)}
                  className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-900 hover:bg-red-100"
                >
                  {s.label} · recovers {s.recovers_hours} of {s.of_hours} h
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!compact && yellow.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {yellow.map((w, i) => (
            <p key={i} className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>{w.message}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
