"use client";

import Link from "next/link";
import { DateTime } from "luxon";
import { Check, CalendarClock, CheckCircle2, Flag, Hourglass, Lock, RotateCcw, Sparkles, X } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { Warnings } from "@/components/Warnings";
import { OverloadCard } from "@/components/OverloadCard";
import { RiskChip } from "@/components/RiskChip";
import { CountUp } from "@/components/CountUp";
import { KIND_STYLE } from "@/components/kinds";
import { fmtHours, fmtTime } from "@/components/fmt";
import { expandEvents } from "@/lib/calendar/simulated";
import { remainingHours } from "@/lib/progress/remaining";
import { addDays, localDateKey, localToUtc, mondayOnOrBefore } from "@/lib/time/slots";
import type { Assignment, AssignmentType, EventKind, StudySession } from "@/lib/types";

const TYPE_LABEL: Record<AssignmentType, string> = { assignment: "Assignments", project: "Projects", exam: "Exams" };

/** Hours-weighted percent done. Finished work counts as 100. */
function pctDone(list: Assignment[]) {
  const total = list.reduce((t, a) => t + a.estimate_hours, 0);
  if (total === 0) return null;
  return Math.round(list.reduce((t, a) => t + a.estimate_hours * (a.status === "completed" ? 100 : a.percent_complete), 0) / total);
}

export default function HomePage() {
  const s = usePlanner();
  const zone = s.settings.timezone;
  const now = DateTime.fromISO(s.now, { zone: "utc" }).setZone(zone);
  const today = localDateKey(s.now, zone);
  const title = (id: string) => s.assignments.find((a) => a.id === id)?.title ?? "Study";
  const live = s.sessions.filter((x) => x.status !== "cancelled");
  const hasPlan = s.sessions.some((x) => x.status === "scheduled");

  // Weekly report
  const weekStart = mondayOnOrBefore(today);
  const weekEnd = addDays(weekStart, 7);
  const thisWeek = live.filter((x) => localDateKey(x.start_at, zone) >= weekStart && localDateKey(x.start_at, zone) < weekEnd);
  const done = thisWeek.filter((x) => x.status === "completed" || x.status === "partial").length;
  const pending = thisWeek.filter((x) => x.status === "scheduled").length;
  const overall = pctDone(s.assignments);
  const active = s.assignments.filter((a) => a.status !== "completed").sort((a, b) => a.due_at.localeCompare(b.due_at));

  // Events: everything that is not a class, next 7 days. Today's rail: everything.
  const occ = expandEvents(s.events, { from: localToUtc(today, "00:00", zone), to: localToUtc(addDays(today, 8), "00:00", zone) }, zone);
  const upcomingEvents = occ.filter((o) => o.kind !== "class" && Date.parse(o.end_at) >= Date.parse(s.now)).sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 5);

  type Item = { key: string; start: string; end: string; title: string; kind: "study" | EventKind; session?: StudySession };
  const rail: Item[] = [
    ...occ.filter((o) => localDateKey(o.start_at, zone) === today).map((o) => ({ key: `${o.event_id}${o.start_at}`, start: o.start_at, end: o.end_at, title: o.title, kind: o.kind })),
    ...live.filter((x) => localDateKey(x.start_at, zone) === today).map((x) => ({ key: x.id, start: x.start_at, end: x.end_at, title: title(x.assignment_id), kind: "study" as const, session: x })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const greeting = now.hour < 12 ? "Good morning" : now.hour < 17 ? "Good afternoon" : "Good evening";
  const dueSoon = active.filter((a) => Date.parse(a.due_at) - Date.parse(s.now) < 7 * 864e5).length;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <header>
          <h1 className="text-3xl font-extrabold tracking-tight">{greeting}</h1>
          <p className="mt-1 text-base text-muted">
            {now.toFormat("cccc, LLLL d")}
            {dueSoon > 0 && <> · <span className="font-semibold text-blue-700">{dueSoon} due this week</span></>}
          </p>
        </header>

        {!hasPlan && (
          <section className="banner-in relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 p-6 text-white shadow-lg shadow-blue-600/20">
            <div>
              <p className="text-xl font-bold">Ready to plan your study time?</p>
              <p className="mt-1 text-blue-100">We’ll fit sessions around your classes and life.</p>
            </div>
            <button onClick={s.generatePlan} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-blue-700 hover:bg-blue-50">
              <Sparkles size={18} aria-hidden /> Make my plan
            </button>
          </section>
        )}

        <OverloadCard />
        <Warnings warnings={s.warnings.filter((w) => w.kind !== "shortfall_week")} />

        {/* Weekly report: three boxes */}
        <section aria-label="This week" className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div style={{ "--i": 0 } as React.CSSProperties} className="rise rounded-3xl bg-white p-6 shadow-sm ring-1 ring-border col-span-2 md:col-span-1">
            <p className="flex items-center gap-2 font-semibold text-muted"><Flag size={18} aria-hidden /> Week progress</p>
            <p className="mt-2 text-5xl font-extrabold text-blue-700"><CountUp value={overall ?? 0} /><span className="text-2xl">%</span></p>
            <ul className="mt-4 space-y-2.5">
              {(["assignment", "project", "exam"] as const).map((t) => {
                const p = pctDone(s.assignments.filter((a) => a.type === t));
                return (
                  <li key={t} className="text-sm">
                    <div className="flex justify-between font-medium"><span>{TYPE_LABEL[t]}</span><span className="text-muted">{p == null ? "none" : `${p}%`}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-blue-100" role="progressbar" aria-label={TYPE_LABEL[t]} aria-valuenow={p ?? 0} aria-valuemin={0} aria-valuemax={100}>
                      <div className="bar h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-700" style={{ width: `${p ?? 0}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <Stat icon={<CheckCircle2 size={18} aria-hidden />} label="Tasks done" value={done} note="study sessions this week" tone="bg-sky-100 text-sky-900" i={1} />
          <Stat icon={<Hourglass size={18} aria-hidden />} label="Tasks pending" value={pending} note="still to do this week" tone="bg-blue-900 text-white" i={2} />
        </section>

        {/* Two big boxes */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section aria-labelledby="dl-h" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-border">
            <div className="flex items-center justify-between">
              <h2 id="dl-h" className="text-xl font-bold">Upcoming deadlines</h2>
              <Link href="/assignments" className="text-sm font-semibold text-blue-700 hover:underline">See all</Link>
            </div>
            {active.length === 0 ? (
              <p className="mt-6 rounded-2xl bg-blue-50 p-6 text-center text-muted">Nothing due. <Link href="/syllabus" className="font-semibold text-blue-700 underline">Add a syllabus</Link></p>
            ) : (
              <ul className="mt-4 space-y-3">
                {active.slice(0, 5).map((a, i) => {
                  const due = DateTime.fromISO(a.due_at, { zone: "utc" }).setZone(zone);
                  const days = Math.ceil(due.diff(now, "days").days);
                  const r = s.risk.find((x) => x.assignment_id === a.id);
                  return (
                    <li key={a.id} style={{ "--i": i } as React.CSSProperties} className="rise lift rounded-2xl bg-blue-50 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-base font-bold">{a.title}</p>
                          <p className="text-sm text-muted">{due.toFormat("ccc, LLL d")} · {days <= 0 ? "today" : days === 1 ? "tomorrow" : `${days} days`}</p>
                        </div>
                        {r && r.level !== "on_track" && <RiskChip level={r.level} hoursShort={r.hours_short} />}
                      </div>
                      <div className="mt-2.5 h-2.5 rounded-full bg-white" role="progressbar" aria-label={`${a.title} progress`} aria-valuenow={a.percent_complete} aria-valuemin={0} aria-valuemax={100}>
                        <div className="bar h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-blue-700" style={{ width: `${a.percent_complete}%` }} />
                      </div>
                      <p className="mt-1.5 text-xs font-medium text-muted">{a.percent_complete}% done · {fmtHours(remainingHours(a))} left</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="ev-h" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-border">
            <div className="flex items-center justify-between">
              <h2 id="ev-h" className="text-xl font-bold">Upcoming events</h2>
              <Link href="/calendar" className="text-sm font-semibold text-blue-700 hover:underline">Calendar</Link>
            </div>
            {upcomingEvents.length === 0 ? (
              <p className="mt-6 rounded-2xl bg-blue-50 p-6 text-center text-muted">No events this week.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {upcomingEvents.map((o, i) => {
                  const k = KIND_STYLE[o.kind];
                  const st = DateTime.fromISO(o.start_at, { zone: "utc" }).setZone(zone);
                  return (
                    <li key={o.event_id + o.start_at} style={{ "--i": i } as React.CSSProperties} className="rise lift flex items-center gap-3 rounded-2xl bg-blue-50 p-4">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${k.chip}`}><k.Icon size={20} aria-hidden /></span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold">{o.title}</p>
                        <p className="flex items-center gap-1 text-sm text-muted"><CalendarClock size={14} aria-hidden /> {st.toFormat("ccc, LLL d · h:mm a")}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Daily schedule, right side */}
      <aside aria-labelledby="today-h" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-border xl:sticky xl:top-7 xl:self-start">
        <h2 id="today-h" className="text-xl font-bold">Today</h2>
        <p className="text-sm text-muted">{now.toFormat("cccc, LLL d")}</p>
        {rail.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-blue-50 p-6 text-center text-muted">Nothing on today. Enjoy it.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {rail.map((it) => <RailCard key={it.key} it={it} zone={zone} />)}
          </ul>
        )}
      </aside>
    </div>
  );
}

function Stat({ icon, label, value, note, tone, i }: { icon: React.ReactNode; label: string; value: number; note: string; tone: string; i: number }) {
  return (
    <div style={{ "--i": i } as React.CSSProperties} className={`rise rounded-3xl p-5 shadow-sm md:p-6 ${tone}`}>
      <p className="flex items-center gap-2 font-semibold opacity-80">{icon} {label}</p>
      <p className="mt-2 text-5xl font-extrabold"><CountUp value={value} /></p>
      <p className="mt-2 text-sm opacity-80">{note}</p>
    </div>
  );
}

function RailCard({ it, zone }: { it: { start: string; end: string; title: string; kind: keyof typeof KIND_STYLE; session?: StudySession }; zone: string }) {
  const markSession = usePlanner((x) => x.markSession);
  const k = KIND_STYLE[it.kind];
  const s = it.session;
  const open = s && s.status === "scheduled";
  const missed = s?.status === "missed";
  return (
    <li className={`lift rounded-2xl border-l-4 p-4 ${k.card} ${missed ? "opacity-60" : ""}`}>
      <p className="flex items-center gap-2 font-bold">
        <k.Icon size={16} aria-hidden />
        <span className={missed ? "line-through" : ""}>{it.title}</span>
        {s?.pinned && <Lock size={13} aria-label="Fixed time" />}
      </p>
      <p className="mt-0.5 text-sm opacity-90">
        {fmtTime(it.start, zone)} – {fmtTime(it.end, zone)}
        {s && !open && ` · ${s.status}`}
      </p>
      {s && !open && (
        <button onClick={() => markSession(s.id, "scheduled")} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-bold text-blue-900 hover:bg-white">
          <RotateCcw size={14} aria-hidden /> Undo
        </button>
      )}
      {open && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => markSession(s.id, "completed")} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-bold text-blue-800 hover:bg-blue-50">
            <Check size={16} aria-hidden /> Done
          </button>
          <button onClick={() => markSession(s.id, "missed")} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-900">
            <X size={16} aria-hidden /> Missed
          </button>
        </div>
      )}
    </li>
  );
}
