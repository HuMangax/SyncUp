"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleDashed, Pin, PinOff, X, XCircle } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { fmtRange } from "./fmt";

/** Mark a study session done, partial (with minutes), or missed; or pin it in place. */
export function SessionDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { sessions, assignments, settings, markSession, togglePin } = usePlanner();
  const s = sessions.find((x) => x.id === sessionId);
  const length = s ? Math.round((Date.parse(s.end_at) - Date.parse(s.start_at)) / 60_000) : 0;
  const [minutes, setMinutes] = useState(Math.round(length / 2 / 15) * 15 || 15);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!s) return null;
  const a = assignments.find((x) => x.id === s.assignment_id);
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const btn = "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-title"
        className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 id="session-title" className="font-semibold">{a?.title ?? "Study session"}</h2>
            <p className="text-sm text-muted">{fmtRange(s, settings.timezone)} · {length} min</p>
            {s.status !== "scheduled" && <p className="mt-1 text-xs font-medium capitalize text-accent">Marked {s.status}</p>}
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-black/5"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button ref={first} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`} onClick={act(() => markSession(s.id, "completed"))}>
            <Check size={16} aria-hidden /> Done
          </button>
          <button className={`${btn} border border-border bg-white hover:bg-black/5`} onClick={act(() => markSession(s.id, "missed"))}>
            <XCircle size={16} aria-hidden /> Missed
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border p-2">
          <label htmlFor="partial-min" className="text-sm text-muted">Did</label>
          <input
            id="partial-min"
            type="number"
            min={0}
            max={length}
            step={15}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(0, Math.min(length, Number(e.target.value))))}
            className="w-16 rounded-md border border-border px-2 py-1 text-sm"
          />
          <span className="text-sm text-muted">min</span>
          <button className={`${btn} ml-auto border border-border bg-white py-1.5 hover:bg-black/5`} onClick={act(() => markSession(s.id, "partial", minutes))}>
            <CircleDashed size={16} aria-hidden /> Partial
          </button>
        </div>

        <button className={`${btn} mt-2 w-full text-accent hover:bg-accent-soft`} onClick={act(() => togglePin(s.id))}>
          {s.pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />}
          {s.pinned ? "Unpin (let the planner move it)" : "Pin to this time"}
        </button>
        <p className="mt-3 text-xs text-muted">Changes don’t overwrite your plan. You’ll review the new schedule before it’s applied.</p>
      </div>
    </div>
  );
}
