"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Minus, Plus, RotateCcw, Undo2, X } from "lucide-react";
import { pendingProposal, usePlanner } from "@/store/planner";
import { Warnings } from "@/components/Warnings";
import { RiskChip } from "@/components/RiskChip";
import { DateTime } from "luxon";
import { fmtRange } from "@/components/fmt";
import { localDateKey, addDays } from "@/lib/time/slots";
import type { DiffEntry, ProposalTrigger, ReasonCode, StudySession } from "@/lib/types";

const REASON: Record<ReasonCode, string> = {
  MISSED_RETURNED: "Missed time returned",
  BEHIND_PACE: "Behind pace",
  AHEAD_PACE: "Ahead of pace",
  CONFLICT: "Conflict",
  DEADLINE_PROTECTION: "Protecting a deadline",
  REBALANCE: "Rebalanced",
};

const KIND = {
  moved: { label: "Moved", Icon: ArrowRight, cls: "bg-indigo-50 text-indigo-800 border-indigo-200" },
  added: { label: "Added", Icon: Plus, cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  removed: { label: "Removed", Icon: Minus, cls: "bg-stone-100 text-stone-700 border-stone-300" },
  kept: { label: "Kept", Icon: Check, cls: "bg-white text-muted border-border" },
} as const;

export default function PreviewPage() {
  const router = useRouter();
  const s = usePlanner();
  const p = pendingProposal(s.proposals);
  const zone = s.settings.timezone;
  const title = (id: string) => s.assignments.find((a) => a.id === id)?.title ?? id;

  if (!p) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">Rescheduling preview</h1>
        <div className="mt-4 rounded-2xl border border-border bg-card p-6">
          <p className="font-medium">Your plan is up to date.</p>
          <p className="mt-1 text-sm text-muted">
            When you mark a session or update progress, the new plan shows up here for you to review before anything changes.
          </p>
          {s.undo && (
            <button
              onClick={s.undoLast}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-black/5"
            >
              <Undo2 size={16} aria-hidden /> Undo last accepted change
            </button>
          )}
        </div>
        <div className="mt-4">
          <Warnings warnings={s.warnings} />
        </div>
      </div>
    );
  }

  const changes = p.diff.filter((e) => e.kind !== "kept");
  const kept = p.diff.filter((e) => e.kind === "kept");
  const count = (k: DiffEntry["kind"]) => p.diff.filter((e) => e.kind === k).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review your updated plan</h1>
        <ul className="mt-1 space-y-0.5 text-sm text-muted">
          {[...p.prior_triggers].reverse().concat(p.trigger).map((t, i) => (
            <li key={i}>{describeTrigger(t, s.sessions, title, zone)}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {(["moved", "added", "removed", "kept"] as const).map((k) => {
          const { label, Icon, cls } = KIND[k];
          return (
            <span key={k} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium ${cls}`}>
              <Icon size={14} aria-hidden /> {count(k)} {label.toLowerCase()}
            </span>
          );
        })}
      </div>

      <Warnings warnings={p.warnings} />

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Deadlines</h2>
        <ul className="divide-y divide-border">
          {p.risk.map((r) => (
            <li key={r.assignment_id} className="flex items-center justify-between py-2 text-sm">
              <span>{title(r.assignment_id)}</span>
              <RiskChip level={r.level} hoursShort={r.hours_short} />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">What changes and why</h2>
        {changes.length === 0 ? (
          <p className="text-sm text-muted">No sessions need to move.</p>
        ) : (
          <ul className="space-y-2">
            {changes.map((e, i) => {
              const { label, Icon, cls } = KIND[e.kind];
              return (
                <li key={i} className="rounded-xl border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
                      <Icon size={12} aria-hidden /> {label}
                    </span>
                    <span className="font-medium">{title(e.assignment_id)}</span>
                    {e.reason && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{REASON[e.reason]}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-muted">
                    {e.before && <span className={e.kind !== "kept" ? "line-through" : ""}>{fmtRange(e.before, zone)}</span>}
                    {e.before && e.after && <ArrowRight size={14} aria-label="to" />}
                    {e.after && <span className="font-medium text-foreground">{fmtRange(e.after, zone)}</span>}
                  </div>
                  {e.explanation && <p className="mt-1">{e.explanation}</p>}
                </li>
              );
            })}
          </ul>
        )}
        {kept.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">{kept.length} sessions stay where they are</summary>
            <ul className="mt-2 space-y-1 text-muted">
              {kept.map((e, i) => (
                <li key={i}>
                  {title(e.assignment_id)} · {fmtRange(e.after!, zone)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <WeekCompare before={s.sessions.filter((x) => x.status === "scheduled")} after={p.new_sessions} now={s.now} zone={zone} />

      <div className="sticky bottom-20 flex gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm md:bottom-4">
        <button
          onClick={() => {
            s.accept(p.id);
            router.push("/calendar");
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Check size={16} aria-hidden /> Accept new plan
        </button>
        <button
          onClick={() => s.reject(p.id)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-black/5"
        >
          <X size={16} aria-hidden /> Keep current plan
        </button>
      </div>
      <p className="text-center text-xs text-muted">
        <RotateCcw size={12} className="mr-1 inline" aria-hidden />
        You can undo once after accepting. <Link href="/calendar" className="underline">Back to calendar</Link>
      </p>
    </div>
  );
}

/** One short sentence describing what the student changed. */
function describeTrigger(t: ProposalTrigger, sessions: StudySession[], title: (id: string) => string, zone: string) {
  if (t.type === "session_status") {
    const s = sessions.find((x) => x.id === t.session_id);
    const what = s ? `${title(s.assignment_id)} (${fmtRange(s, zone)})` : "a session";
    const verb = t.status === "missed" ? "missed" : t.status === "partial" ? `partly done (${t.minutes_done} min)` : "done";
    return `You marked ${what} as ${verb}.`;
  }
  if (t.type === "progress") {
    const how = t.remaining_hours != null ? `${t.remaining_hours} h left` : `${t.percent}% done`;
    return `You set ${title(t.assignment_id)} to ${how}.`;
  }
  if (t.type === "settings") return "Your schedule settings changed.";
  if (t.type === "calendar_change") return "Your calendar changed. Commitments stay put; study sessions move around them.";
  return "The plan was recalculated.";
}

/** Hours per day for the next 7 days, before and after. */
function WeekCompare({ before, after, now, zone }: { before: StudySession[]; after: StudySession[]; now: string; zone: string }) {
  const start = localDateKey(now, zone);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const sum = (list: StudySession[], d: string) =>
    list.filter((x) => localDateKey(x.start_at, zone) === d && Date.parse(x.end_at) > Date.parse(now)).reduce((h, x) => h + (Date.parse(x.end_at) - Date.parse(x.start_at)) / 3.6e6, 0);
  const max = Math.max(1, ...days.flatMap((d) => [sum(before, d), sum(after, d)]));
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Next 7 days: study hours before and after</h2>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const b = sum(before, d);
          const a = sum(after, d);
          return (
            <div key={d} className="text-center text-xs">
              <div className="flex h-24 items-end justify-center gap-1" aria-label={`${d}: ${b} h before, ${a} h after`}>
                <div className="hatch w-3 rounded-t bg-stone-300" style={{ height: `${(b / max) * 100}%` }} title={`Before: ${b} h`} />
                <div className="w-3 rounded-t bg-indigo-600" style={{ height: `${(a / max) * 100}%` }} title={`After: ${a} h`} />
              </div>
              <div className="mt-1 text-muted">{DateTime.fromISO(d).toFormat("ccc")}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="hatch inline-block h-2.5 w-2.5 rounded-sm bg-stone-300" /> Before</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-600" /> After</span>
      </div>
    </section>
  );
}
