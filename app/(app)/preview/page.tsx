"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Minus, Plus, RotateCcw, Undo2, X } from "lucide-react";
import { pendingProposal, usePlanner } from "@/store/planner";
import { Warnings } from "@/components/Warnings";
import { RiskChip } from "@/components/RiskChip";
import { DateTime } from "luxon";
import { fmtRange } from "@/components/fmt";
import { expandEvents } from "@/lib/calendar/simulated";
import { localDateKey, addDays, localToUtc } from "@/lib/time/slots";
import type { CalendarEvent, DiffEntry, ProposalTrigger, ReasonCode, StudySession } from "@/lib/types";

const REASON: Record<ReasonCode, string> = {
  MISSED_RETURNED: "Missed a session",
  BEHIND_PACE: "Behind pace",
  AHEAD_PACE: "Ahead of pace",
  CONFLICT: "Conflict",
  DEADLINE_PROTECTION: "Protecting a deadline",
  REBALANCE: "Rebalanced",
};

const KIND = {
  moved: { label: "Moved", Icon: ArrowRight, tile: "bg-amber-100 text-amber-950", block: "bg-amber-400 text-amber-950 border-amber-600" },
  added: { label: "Added", Icon: Plus, tile: "bg-blue-600 text-white", block: "bg-blue-600 text-white border-blue-900" },
  removed: { label: "Removed", Icon: Minus, tile: "bg-rose-100 text-rose-950", block: "bg-rose-50 text-rose-900 border-rose-400 border-dashed" },
  kept: { label: "Kept", Icon: Check, tile: "bg-blue-50 text-blue-900", block: "bg-blue-200 text-blue-950 border-blue-400" },
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
        <h1 className="text-3xl font-extrabold tracking-tight">Review changes</h1>
        <div className="mt-4 rounded-3xl bg-card shadow-sm ring-1 ring-border p-6">
          <p className="font-medium">Nothing to review.</p>
          <p className="mt-1 text-sm text-muted">
            When your week changes, the new plan shows up here first.
          </p>
          {s.undo && (
            <button
              onClick={s.undoLast}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-black/5"
            >
              <Undo2 size={16} aria-hidden /> Undo last change
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
  const count = (k: DiffEntry["kind"]) => p.diff.filter((e) => e.kind === k).length;
  const worry = p.risk.filter((r) => r.level !== "on_track");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Review changes</h1>
        <p className="mt-1 text-base text-muted">{describeTrigger([...p.prior_triggers].reverse().concat(p.trigger).slice(-1)[0], s.sessions, title, zone)}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {(["moved", "added", "removed"] as const).map((k, i) => {
          const { label, Icon, tile } = KIND[k];
          return (
            <div key={k} style={{ "--i": i } as React.CSSProperties} className={`rise rounded-3xl p-4 shadow-sm md:p-6 ${tile}`}>
              <Icon size={22} aria-hidden />
              <p className="mt-2 text-4xl font-extrabold md:text-5xl">{count(k)}</p>
              <p className="text-sm font-semibold">{label}</p>
            </div>
          );
        })}
      </div>

      {worry.length === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl bg-blue-100 px-5 py-3 font-semibold text-blue-900"><Check size={18} aria-hidden /> Every deadline is on track</p>
      ) : (
        <section className="flex flex-wrap gap-2" aria-label="Deadlines at risk">
          {worry.map((r) => (
            <span key={r.assignment_id} className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2 font-semibold shadow-sm ring-1 ring-border">
              {title(r.assignment_id)} <RiskChip level={r.level} hoursShort={r.hours_short} />
            </span>
          ))}
        </section>
      )}
      <Warnings warnings={p.warnings} />

      <BeforeAfter diff={p.diff} now={s.now} zone={zone} events={s.events} title={title} />

      <div className="sticky bottom-20 z-30 flex gap-2 rounded-3xl bg-card p-3 shadow-lg ring-1 ring-border md:bottom-4">
        <button
          onClick={() => {
            s.accept(p.id);
            router.push("/calendar");
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-accent px-5 py-3 text-base font-bold text-white hover:bg-blue-700"
        >
          <Check size={18} aria-hidden /> Looks good
        </button>
        <button
          onClick={() => s.reject(p.id)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-3 text-base font-semibold hover:bg-blue-50 md:flex-none md:px-5"
        >
          <X size={18} aria-hidden /> Keep old plan
        </button>
      </div>
      <p className="text-center text-xs text-muted">
        <RotateCcw size={12} className="mr-1 inline" aria-hidden />
        You can undo once. <Link href="/calendar" className="underline">Back to calendar</Link>
        {changes.length === 0 && " Nothing needs to move."}
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

const HOUR = 26; // px per hour in the compare grid

/** One week grid you can flip between the old and the new plan. Moved blocks slide. */
function BeforeAfter({ diff, now, zone, events, title }: { diff: DiffEntry[]; now: string; zone: string; events: CalendarEvent[]; title: (id: string) => string }) {
  const [mode, setMode] = useState<"before" | "after">("before");
  const [hover, setHover] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Show the old plan first, then slide into the new one once.
  useEffect(() => {
    const t = setTimeout(() => setMode("after"), 900);
    return () => clearTimeout(t);
  }, []);

  const day = (iso: string) => localDateKey(iso, zone);
  const mins = (iso: string) => {
    const d = DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
    return d.hour * 60 + d.minute;
  };
  const sessionsOf = (e: DiffEntry) => [e.before, e.after].filter(Boolean) as StudySession[];
  const changed = diff.filter((e) => e.kind !== "kept");
  const firstDay = [...(changed.length ? changed : diff).flatMap(sessionsOf).map((x) => day(x.start_at))].sort()[0] ?? localDateKey(now, zone);
  const days = Array.from({ length: 7 }, (_, i) => addDays(firstDay, i));
  const inWeek = (x?: StudySession) => !!x && days.includes(day(x.start_at));

  const all = diff.flatMap(sessionsOf);
  const startH = Math.max(0, Math.floor(Math.min(...all.map((x) => mins(x.start_at)), 9 * 60) / 60) - 1);
  const endH = Math.min(24, Math.ceil(Math.max(...all.map((x) => mins(x.end_at) || 24 * 60), 18 * 60) / 60) + 1);
  const hrs = Array.from({ length: endH - startH }, (_, i) => startH + i);

  const occ = expandEvents(events, { from: localToUtc(days[0], "00:00", zone), to: localToUtc(addDays(days[6], 1), "00:00", zone) }, zone);
  const pos = (x: StudySession) => ({
    left: `${(days.indexOf(day(x.start_at)) / 7) * 100}%`,
    top: ((mins(x.start_at) - startH * 60) / 60) * HOUR,
    height: Math.max(((Date.parse(x.end_at) - Date.parse(x.start_at)) / 3.6e6) * HOUR, 14),
  });

  return (
    <section aria-labelledby="ba-h" className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-border md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ba-h" className="text-xl font-bold">Your week</h2>
        <div role="tablist" aria-label="Which plan" className="flex rounded-xl bg-blue-100 p-1">
          {(["before", "after"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-lg px-5 py-2 text-sm font-bold capitalize transition-colors ${mode === m ? "bg-blue-600 text-white shadow" : "text-blue-900 hover:bg-white/60"}`}>
              {m === "before" ? "Old plan" : "New plan"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[36px_1fr] ">
            <div />
            <div className="grid grid-cols-7 pb-1 text-center text-xs font-bold text-muted">
              {days.map((d) => <span key={d}>{DateTime.fromISO(d).toFormat("ccc d")}</span>)}
            </div>
            <div className="relative" style={{ height: hrs.length * HOUR }}>
              {hrs.map((h, i) => <span key={h} className="absolute right-1 -translate-y-1.5 text-[10px] text-muted" style={{ top: i * HOUR }}>{DateTime.fromObject({ hour: h }).toFormat("ha").toLowerCase()}</span>)}
            </div>
            <div className="relative isolate overflow-hidden rounded-2xl bg-blue-50/60" style={{ height: hrs.length * HOUR }}>
              {hrs.map((h, i) => <div key={h} className="absolute inset-x-0 border-t border-blue-100" style={{ top: i * HOUR }} />)}
              {days.map((d, i) => i > 0 && <div key={d} className="absolute inset-y-0 border-l border-blue-100" style={{ left: `${(i / 7) * 100}%` }} />)}

              {occ.filter((o) => !o.cancelled).map((o) => {
                const top = ((mins(o.start_at) - startH * 60) / 60) * HOUR;
                const h = ((Date.parse(o.end_at) - Date.parse(o.start_at)) / 3.6e6) * HOUR;
                const i = days.indexOf(day(o.start_at));
                if (i < 0 || top + h < 0) return null;
                return <div key={o.event_id + o.start_at} aria-hidden className="absolute rounded bg-slate-200/70" style={{ left: `calc(${(i / 7) * 100}% + 2px)`, width: `calc(${100 / 7}% - 4px)`, top: Math.max(0, top), height: h }} />;
              })}

              {diff.map((e, i) => {
                const x = mode === "before" ? e.before : e.after;
                const other = mode === "before" ? e.after : e.before;
                const ghost = !x; // added while viewing old plan, removed while viewing new
                const ref = x ?? other;
                if (!ref || (!inWeek(x) && !inWeek(other))) return null;
                const at = pos(ref);
                const k = KIND[e.kind];
                const dim = hover != null && hover !== i;
                return (
                  <div
                    key={i}
                    aria-hidden
                    className={`absolute flex items-start gap-0.5 overflow-hidden rounded-md border-l-4 px-1 py-0.5 text-[10px] font-bold leading-tight ${k.block}`}
                    style={{
                      left: `calc(${at.left} + 2px)`,
                      width: `calc(${100 / 7}% - 4px)`,
                      top: at.top,
                      height: at.height,
                      opacity: ghost ? 0 : dim ? 0.25 : 1,
                      transform: ghost ? "scale(0.85)" : hover === i ? "scale(1.05)" : "none",
                      zIndex: hover === i ? 10 : 1,
                      transition: "left 700ms cubic-bezier(.3,.7,.2,1), top 700ms cubic-bezier(.3,.7,.2,1), opacity 350ms, transform 250ms",
                    }}
                  >
                    <k.Icon size={10} className="mt-px shrink-0" />
                    <span className="truncate">{title(e.assignment_id)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-muted" aria-label="Key">
        {(["kept", "moved", "added", "removed"] as const).map((k) => {
          const { label, Icon, block } = KIND[k];
          return <li key={k} className="flex items-center gap-1.5"><span className={`grid h-5 w-5 place-items-center rounded border-l-4 ${block}`}><Icon size={10} aria-hidden /></span>{label}</li>;
        })}
        <li className="flex items-center gap-1.5"><span className="h-5 w-5 rounded bg-slate-200/70" /> Classes and events</li>
      </ul>

      {changed.length > 0 && (
        <ul className="mt-5 grid gap-2 md:grid-cols-2">
          {(showAll ? changed : changed.slice(0, 6)).map((e) => {
            const i = diff.indexOf(e);
            const k = KIND[e.kind];
            return (
              <li
                key={i}
                tabIndex={0}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                title={e.explanation}
                className="lift flex items-center gap-3 rounded-2xl bg-blue-50 p-3 outline-none ring-blue-400 focus-visible:ring-2"
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${k.tile}`}><k.Icon size={18} aria-label={k.label} /></span>
                <div className="min-w-0 text-sm">
                  <p className="truncate font-bold">{title(e.assignment_id)}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-muted">
                    {e.before && <span className={e.after ? "line-through" : ""}>{DateTime.fromISO(e.before.start_at, { zone: "utc" }).setZone(zone).toFormat("ccc h:mma")}</span>}
                    {e.before && e.after && <ArrowRight size={12} aria-hidden />}
                    {e.after && <span className="font-bold text-foreground">{DateTime.fromISO(e.after.start_at, { zone: "utc" }).setZone(zone).toFormat("ccc h:mma")}</span>}
                  </p>
                </div>
                {e.reason && <span className="ml-auto shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-800">{REASON[e.reason]}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {changed.length > 6 && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm font-bold text-blue-700 hover:underline">{showAll ? "Show fewer" : `Show all ${changed.length}`}</button>
      )}
    </section>
  );
}
