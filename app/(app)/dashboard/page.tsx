"use client";

import Link from "next/link";
import { DateTime } from "luxon";
import { Check, Flag, Pencil, Pin, XCircle } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { Warnings } from "@/components/Warnings";
import { RiskChip } from "@/components/RiskChip";
import { fmtHours, fmtTime } from "@/components/fmt";
import { primaryBtn } from "@/components/Modal";
import { remainingHours } from "@/lib/progress/remaining";
import { addDays, localDateKey, mondayOnOrBefore } from "@/lib/time/slots";
import type { StudySession } from "@/lib/types";

const hoursOf = (s: StudySession) => (Date.parse(s.end_at) - Date.parse(s.start_at)) / 3.6e6;

export default function DashboardPage() {
  const s = usePlanner();
  const zone = s.settings.timezone;
  const now = DateTime.fromISO(s.now, { zone: "utc" }).setZone(zone);
  const today = localDateKey(s.now, zone);
  const title = (id: string) => s.assignments.find((a) => a.id === id)?.title ?? "Study";
  const study = s.sessions.filter((x) => x.status !== "cancelled").sort((a, b) => a.start_at.localeCompare(b.start_at));
  const todays = study.filter((x) => localDateKey(x.start_at, zone) === today);
  const upcoming = study.filter((x) => x.status === "scheduled" && Date.parse(x.start_at) >= Date.parse(s.now) && localDateKey(x.start_at, zone) !== today).slice(0, 3);
  const active = s.assignments.filter((a) => a.status !== "completed").sort((a, b) => a.due_at.localeCompare(b.due_at));
  const hasPlan = s.sessions.some((x) => x.status === "scheduled");
  const todayHours = todays.filter((x) => x.status !== "missed").reduce((h, x) => h + hoursOf(x), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="text-sm text-muted">{now.toFormat("cccc, LLLL d")}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {todays.length === 0 ? "Nothing booked today" : `${todays.length} session${todays.length === 1 ? "" : "s"} today, ${fmtHours(todayHours)} of study`}
        </h1>
      </header>

      {!hasPlan && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="font-medium">You have {active.length} assignments and no study plan yet.</p>
          <p className="mt-1 text-sm text-muted">The planner fits study sessions around your classes, shifts and plans.</p>
          <button onClick={s.generatePlan} className={`${primaryBtn} mt-4`}>Generate plan</button>
        </div>
      )}

      <Warnings warnings={s.warnings} />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <section aria-labelledby="today-h" className="rounded-2xl border border-border bg-card p-5">
            <h2 id="today-h" className="text-sm font-semibold">Today</h2>
            {todays.length === 0 ? (
              <p className="mt-2 text-sm text-muted">A free day. Enjoy it.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {todays.map((x) => <SessionRow key={x.id} s={x} title={title(x.assignment_id)} zone={zone} />)}
              </ul>
            )}
          </section>

          <section aria-labelledby="next-h" className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 id="next-h" className="text-sm font-semibold">Coming up</h2>
              <Link href="/calendar" className="text-sm font-medium text-accent hover:underline">Open calendar</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No more sessions planned.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {upcoming.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <Pencil size={14} className="text-accent" aria-hidden />
                      {title(x.assignment_id)}
                    </span>
                    <span className="text-muted">
                      {DateTime.fromISO(x.start_at, { zone: "utc" }).setZone(zone).toFormat("ccc h:mm a")}, {Math.round(hoursOf(x) * 60)} min
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-5">
          {weekLoad(study)}
          <section aria-labelledby="dl-h" className="rounded-2xl border border-border bg-card p-5">
            <h2 id="dl-h" className="text-sm font-semibold">Deadlines</h2>
            <ul className="mt-3 space-y-4">
              {active.map((a) => {
                const due = DateTime.fromISO(a.due_at, { zone: "utc" }).setZone(zone);
                const days = Math.ceil(due.diff(now, "days").days);
                const r = s.risk.find((x) => x.assignment_id === a.id);
                return (
                  <li key={a.id}>
                    <div className="flex items-start justify-between gap-2 text-sm">
                      <div>
                        <p className="font-medium">{a.title}</p>
                        <p className="flex items-center gap-1 text-xs text-muted">
                          <Flag size={12} aria-hidden /> {due.toFormat("ccc, LLL d")} ({days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`})
                        </p>
                      </div>
                      {r && <RiskChip level={r.level} hoursShort={r.hours_short} />}
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-stone-200" role="progressbar" aria-valuenow={a.percent_complete} aria-valuemin={0} aria-valuemax={100} aria-label={`${a.title} progress`}>
                      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${a.percent_complete}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted">{a.percent_complete}% done, {fmtHours(remainingHours(a))} left</p>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );

  function weekLoad(sessions: StudySession[]) {
    const start = mondayOnOrBefore(today);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const max = s.settings.max_hours_per_day;
    const per = days.map((d) => ({
      d,
      h: sessions.filter((x) => x.status !== "missed" && localDateKey(x.start_at, zone) === d).reduce((t, x) => t + hoursOf(x), 0),
      free: s.settings.free_days.includes(DateTime.fromISO(d).weekday % 7),
    }));
    const total = per.reduce((t, x) => t + x.h, 0);
    const cap = per.filter((x) => !x.free).length * max;
    return (
      <section aria-labelledby="wk-h" className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <h2 id="wk-h" className="text-sm font-semibold">This week</h2>
          <span className="text-sm text-muted">{fmtHours(total)} of {cap} h you allow</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-stone-200" role="meter" aria-valuenow={total} aria-valuemin={0} aria-valuemax={cap} aria-label="Study hours this week">
          <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, (total / Math.max(cap, 1)) * 100)}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1.5" aria-hidden>
          {per.map(({ d, h, free }) => {
            const full = h >= 0.9 * max && h > 0;
            return (
              <div key={d} className="text-center text-[11px] text-muted">
                <div className="relative flex h-20 items-end justify-center rounded-md bg-stone-100">
                  {free ? (
                    <span className="absolute inset-0 grid place-items-center text-[10px]">off</span>
                  ) : (
                    <div className={`w-full rounded-md ${full ? "hatch bg-amber-400" : "bg-indigo-300"} ${d === today ? "bg-indigo-600" : ""}`} style={{ height: `${(h / max) * 100}%` }} />
                  )}
                </div>
                <div className={`mt-1 ${d === today ? "font-semibold text-foreground" : ""}`}>{DateTime.fromISO(d).toFormat("ccc")}</div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">Hatched bars are days at 90% or more of your {max} h daily max.</p>
      </section>
    );
  }
}

function SessionRow({ s, title, zone }: { s: StudySession; title: string; zone: string }) {
  const markSession = usePlanner((x) => x.markSession);
  const done = s.status !== "scheduled";
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2.5">
      <span className={`h-9 w-1 rounded-full ${s.status === "missed" ? "bg-stone-300" : "bg-accent"}`} aria-hidden />
      <div className="min-w-[11rem] flex-1">
        <p className={`text-sm font-medium ${s.status === "missed" ? "text-muted line-through" : ""}`}>
          {title} {s.pinned && <Pin size={12} className="inline" aria-label="Pinned" />}
        </p>
        <p className="text-xs text-muted">{fmtTime(s.start_at, zone)} to {fmtTime(s.end_at, zone)}{done ? `, marked ${s.status}` : ""}</p>
      </div>
      {!done && (
        <div className="flex gap-1.5">
          <button onClick={() => markSession(s.id, "completed")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800">
            <Check size={14} aria-hidden /> Done
          </button>
          <button onClick={() => markSession(s.id, "missed")} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5">
            <XCircle size={14} aria-hidden /> Missed
          </button>
        </div>
      )}
    </li>
  );
}
