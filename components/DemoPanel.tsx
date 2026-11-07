"use client";

import { useRef, useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { fmtDayTime } from "./fmt";

/** Presenter controls. Each calls the same store actions as the UI: no demo-only scheduling. */
export function DemoPanel() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const s = usePlanner();

  const exportJson = () => {
    const blob = new Blob([s.exportState()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planner-${s.anchor}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Exported.");
  };
  const importJson = async (f: File) => {
    const r = s.importState(await f.text());
    setMsg(r.ok ? "Imported." : r.error);
  };
  if (process.env.NEXT_PUBLIC_DEMO !== "1") return null;

  const items: [string, () => void][] = [
    ["Reset demo", s.reset],
    ["Advance clock 1 h", () => s.advanceClock(1)],
    ["Mark next session missed", s.demoMarkNextMissed],
    ["Log 1 h on Marketing, set 25%", s.demoLogMarketing],
    ["Surprise shift (Thu, 6 h)", s.demoSurpriseShift],
    ["Squeeze week", s.demoSqueezeWeek],
  ];

  return (
    <div className="fixed bottom-40 right-4 z-30 md:bottom-4">
      {open ? (
        <div className="w-64 rounded-2xl border border-border bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">Demo controls</span>
            <button aria-label="Close demo controls" onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:bg-black/5"><X size={16} /></button>
          </div>
          <p className="mb-2 text-xs text-muted">Clock: {fmtDayTime(s.now, s.settings.timezone)}</p>
          <div className="flex flex-col gap-1.5">
            {items.map(([label, fn]) => (
              <button key={label} onClick={() => { setMsg(null); fn(); }} className="rounded-lg border border-border px-3 py-1.5 text-left text-sm hover:bg-black/5">
                {label}
              </button>
            ))}
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              <button onClick={exportJson} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-black/5">Export</button>
              <button onClick={() => file.current?.click()} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-black/5">Import</button>
            </div>
            <input
              ref={file}
              type="file"
              accept="application/json"
              className="sr-only"
              aria-label="Import planner state file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJson(f);
                e.target.value = "";
              }}
            />
            {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium shadow-md hover:bg-black/5"
        >
          <FlaskConical size={16} aria-hidden /> Demo
        </button>
      )}
    </div>
  );
}
