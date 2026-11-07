"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { templateBreakdown, type BreakdownResult } from "@/lib/ai/breakdown";
import type { Assignment, Subtask, SubtaskSource } from "@/lib/types";
import { Modal, primaryBtn, secondaryBtn } from "./Modal";

type Row = { title: string; hours: string; source: SubtaskSource };

const SOURCE_LABEL: Record<BreakdownResult["source"], string> = {
  ai: "Suggested by AI",
  cache: "Suggested by AI (saved for the demo)",
  template: "Standard template",
};

/** Suggest subtasks, let the student edit them, then add them to the plan (opens a proposal). */
export function BreakdownPanel({ assignment: a, onClose }: { assignment: Assignment; onClose: () => void }) {
  const { settings, subtasks, setSubtasks } = usePlanner();
  const existing = subtasks.filter((t) => t.assignment_id === a.id).sort((x, y) => x.order_idx - y.order_idx);
  const useAi = a.ai_enabled ?? settings.ai_default;
  const [rows, setRows] = useState<Row[]>(existing.map((t) => ({ title: t.title, hours: String(t.estimate_hours), source: t.source })));
  const [meta, setMeta] = useState<{ source: BreakdownResult["source"]; assumptions: string[]; note?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const suggest = useCallback(async () => {
    setLoading(true);
    let r: BreakdownResult;
    let note: string | undefined;
    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: a.title, course: a.course, type: a.type, description: a.description, estimateHours: a.estimate_hours, useAi }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      r = await res.json();
    } catch (e) {
      r = templateBreakdown(a.type, a.estimate_hours);
      note = `Couldn't reach the breakdown service (${e instanceof Error ? e.message : "offline"}), so this is the standard template.`;
    }
    setRows(r.subtasks.map((s) => ({ title: s.title, hours: String(s.estimateHours), source: r.source === "template" ? "template" : "ai" })));
    setMeta({ source: r.source, assumptions: r.assumptions, note });
    setLoading(false);
  }, [a, useAi]);

  useEffect(() => {
    if (existing.length === 0) void suggest();
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = rows.reduce((t, r) => t + (Number(r.hours) || 0), 0);
  const valid = rows.length > 0 && rows.every((r) => r.title.trim() && Number(r.hours) >= 0.25);
  // Any edit makes the step the student's own.
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch, source: "manual" } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const out = [...rs];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });

  const save = () => {
    const list: Subtask[] = rows.map((r, i) => ({
      id: `st-${a.id}-${i + 1}`,
      assignment_id: a.id,
      title: r.title.trim(),
      order_idx: i + 1,
      estimate_hours: Number(r.hours),
      percent_complete: 0,
      source: r.source,
    }));
    setSubtasks(a.id, list);
    onClose();
  };

  return (
    <Modal title={`Break down ${a.title}`} onClose={onClose} wide>
      <p className="text-sm text-muted">
        Steps are worked through in order. The planner decides when; this only sets what and roughly how long.
      </p>
      {meta && (
        <div className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-xs text-muted">
          <p className="flex items-center gap-1 font-medium text-foreground">
            <Sparkles size={12} aria-hidden /> {SOURCE_LABEL[meta.source]}
          </p>
          {meta.note && <p className="mt-1">{meta.note}</p>}
          {meta.assumptions.map((x, i) => <p key={i} className="mt-0.5">{x}</p>)}
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-muted" role="status">Getting suggestions…</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-1 font-medium">Step</th>
              <th className="w-20 pb-1 font-medium">Hours</th>
              <th className="w-28 pb-1"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <input aria-label={`Step ${i + 1} name`} className="w-full rounded-md border border-border px-2 py-1" value={r.title} onChange={(e) => update(i, { title: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input aria-label={`Step ${i + 1} hours`} type="number" min={0.5} step={0.5} className="w-full rounded-md border border-border px-2 py-1" value={r.hours} onChange={(e) => update(i, { hours: e.target.value })} />
                </td>
                <td className="py-1">
                  <div className="flex gap-0.5">
                    <button type="button" aria-label={`Move step ${i + 1} up`} onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:bg-black/5"><ArrowUp size={14} /></button>
                    <button type="button" aria-label={`Move step ${i + 1} down`} onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:bg-black/5"><ArrowDown size={14} /></button>
                    <button type="button" aria-label={`Remove step ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:bg-black/5 hover:text-red-700"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={() => setRows((rs) => [...rs, { title: "", hours: "1", source: "manual" }])} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-accent hover:bg-accent-soft">
          <Plus size={14} aria-hidden /> Add a step
        </button>
        <span className={Math.abs(total - a.estimate_hours) > 0.25 * a.estimate_hours ? "text-amber-800" : "text-muted"}>
          {total} h in steps, your estimate is {a.estimate_hours} h
        </span>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => void suggest()} className={secondaryBtn} disabled={loading}>
          {useAi ? "Suggest again" : "Use the template"}
        </button>
        <button type="button" onClick={save} className={primaryBtn} disabled={!valid || loading}>Add to plan</button>
      </div>
    </Modal>
  );
}
