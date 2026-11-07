"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { Briefcase, BookOpen, ChevronLeft, ChevronRight, Flag, Heart, Pencil, Pin, Plus, Undo2 } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { SessionDialog } from "./SessionDialog";
import { Warnings } from "./Warnings";
import { AddEventDialog, RemoveEventDialog } from "./EventDialog";
import { expandEvents } from "@/lib/calendar/simulated";
import { addDays, localDateKey, localToUtc, mondayOnOrBefore } from "@/lib/time/slots";
import type { EventKind, EventOccurrence, StudySession } from "@/lib/types";

const HOUR_H = 44; // px per hour
const GRID_START = 6; // 06:00
const GRID_END = 24;

const KIND_STYLE: Record<EventKind, { cls: string; Icon: typeof BookOpen; label: string }> = {
  class: { cls: "bg-slate-200 text-slate-900 border-slate-400", Icon: BookOpen, label: "Class" },
  work: { cls: "bg-amber-200 text-amber-950 border-amber-500", Icon: Briefcase, label: "Work" },
  social: { cls: "bg-rose-200 text-rose-950 border-rose-400", Icon: Heart, label: "Social" },
  other: { cls: "bg-stone-200 text-stone-900 border-stone-400", Icon: Heart, label: "Other" },
};

type Block = {
  key: string;
  top: number;
  height: number;
  title: string;
  sub: string;
  kind: "study" | EventKind;
  pinned?: boolean;
  status?: string;
  sessionId?: string;
  eventId?: string;
};

function minutesInDay(iso: string, zone: string, dayKey: string, edge: "start" | "end"): number {
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
  const dayStart = DateTime.fromISO(dayKey, { zone });
  if (edge === "start") return Math.max(0, dt.diff(dayStart, "minutes").minutes);
  return Math.min(24 * 60, dt.diff(dayStart, "minutes").minutes);
}

export function WeekGrid() {
  const { now, events, sessions, assignments, subtasks, settings, warnings, generatePlan, lastChanged, undo, undoLast } = usePlanner();
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Highlight sessions that the last accepted proposal moved or added, for a few seconds.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!lastChanged || Date.now() - lastChanged.at > 8000) return;
    setFresh(new Set(lastChanged.ids));
    const t = setTimeout(() => setFresh(new Set()), 4000);
    return () => clearTimeout(t);
  }, [lastChanged]);
  const hasPlan = sessions.some((s) => s.status === "scheduled");
  const zone = settings.timezone;
  const todayKey = localDateKey(now, zone);
  const [weekStart, setWeekStart] = useState(() => mondayOnOrBefore(todayKey));
  const [mobileDay, setMobileDay] = useState(todayKey);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const occurrences = useMemo(
    () =>
      expandEvents(
        events,
        { from: localToUtc(weekStart, "00:00", zone), to: localToUtc(addDays(weekStart, 7), "00:00", zone) },
        zone,
      ),
    [events, weekStart, zone],
  );

  const titleOf = (id: string) => assignments.find((a) => a.id === id)?.title ?? "Study";

  const blocksFor = (dayKey: string): Block[] => {
    const out: Block[] = [];
    const clip = (startIso: string, endIso: string) => {
      const s = minutesInDay(startIso, zone, dayKey, "start");
      const e = minutesInDay(endIso, zone, dayKey, "end");
      if (e <= s || e <= GRID_START * 60 || s >= GRID_END * 60) return null;
      const cs = Math.max(s, GRID_START * 60);
      const ce = Math.min(e, GRID_END * 60);
      return { top: ((cs - GRID_START * 60) / 60) * HOUR_H, height: Math.max(((ce - cs) / 60) * HOUR_H, 18), s, e };
    };
    const fmt = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(zone).toFormat("h:mm a");
    occurrences.forEach((o: EventOccurrence) => {
      const c = clip(o.start_at, o.end_at);
      if (c) out.push({ key: `${o.event_id}-${o.start_at}`, top: c.top, height: c.height, title: o.title, sub: `${fmt(o.start_at)} – ${fmt(o.end_at)}`, kind: o.kind, eventId: o.event_id });
    });
    sessions
      .filter((s: StudySession) => s.status !== "cancelled")
      .forEach((s) => {
        const c = clip(s.start_at, s.end_at);
        const step = s.subtask_id ? subtasks.find((t) => t.id === s.subtask_id)?.title : undefined;
        if (c) out.push({ key: s.id, top: c.top, height: c.height, title: titleOf(s.assignment_id), sub: `${step ? `${step}, ` : ""}${fmt(s.start_at)} – ${fmt(s.end_at)}`, kind: "study", pinned: s.pinned, status: s.status, sessionId: s.id });
      });
    return out;
  };

  const loadOf = (dayKey: string) =>
    sessions
      .filter((s) => s.status !== "cancelled" && s.status !== "missed" && localDateKey(s.start_at, zone) === dayKey)
      .reduce((h, s) => h + (Date.parse(s.end_at) - Date.parse(s.start_at)) / 3.6e6, 0);

  const deadlinesFor = (dayKey: string) =>
    assignments.filter((a) => localDateKey(a.due_at, zone) === dayKey);

  const hours = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);
  const label = (k: string) => DateTime.fromISO(k, { zone }).toFormat("ccc d");
  const rangeLabel = `${DateTime.fromISO(weekStart, { zone }).toFormat("LLL d")} – ${DateTime.fromISO(addDays(weekStart, 6), { zone }).toFormat("LLL d, yyyy")}`;

  const renderCol = (dayKey: string) => (
    <div key={dayKey} className="relative border-l border-border" style={{ height: hours.length * HOUR_H }}>
      {hours.map((h, i) => (
        <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * HOUR_H }} />
      ))}
      {dayKey === todayKey && (() => {
        const m = minutesInDay(now, zone, dayKey, "start");
        if (m < GRID_START * 60 || m >= GRID_END * 60) return null;
        return (
          <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: ((m - GRID_START * 60) / 60) * HOUR_H }} aria-hidden>
            <span className="-ml-1 h-2 w-2 rounded-full bg-red-600" />
            <span className="h-px flex-1 bg-red-600" />
          </div>
        );
      })()}
      {blocksFor(dayKey).map((b) => {
        const study = b.kind === "study";
        const style = study ? null : KIND_STYLE[b.kind as EventKind];
        const Icon = study ? Pencil : style!.Icon;
        const isFresh = !!b.sessionId && fresh.has(b.sessionId);
        const cls = `absolute inset-x-0.5 overflow-hidden rounded-md border-l-4 ${isFresh ? "just-moved z-10" : ""} px-1.5 py-0.5 text-left text-[11px] leading-tight ${
          study ? "border-indigo-800 bg-indigo-600 text-white shadow-sm hover:bg-indigo-700" : `${style!.cls} hatch`
        } ${b.status === "missed" ? "opacity-50 line-through" : ""} ${b.status === "completed" ? "bg-indigo-400" : ""}`;
        const body = (
          <>
            <div className="flex items-center gap-1 font-semibold">
              <Icon size={11} aria-hidden />
              <span className="truncate">{b.title}</span>
              {b.pinned && <Pin size={10} aria-label="Pinned" />}
              {b.status && b.status !== "scheduled" && <span className="sr-only">({b.status})</span>}
            </div>
            {isFresh && <span className="absolute right-1 top-0.5 rounded bg-white px-1 text-[9px] font-bold text-indigo-800">Updated</span>}
            {b.height > 30 && <div className="truncate opacity-90">{b.sub}</div>}
          </>
        );
        return study ? (
          <button
            key={b.key}
            title={`${b.title} · ${b.sub}`}
            aria-label={`${b.title}, ${b.sub}${b.status && b.status !== "scheduled" ? `, ${b.status}` : ""}. Update session`}
            className={cls}
            style={{ top: b.top, height: b.height }}
            onClick={() => setOpenSession(b.sessionId!)}
          >
            {body}
          </button>
        ) : b.eventId?.startsWith("ev-user-") ? (
          <button
            key={b.key}
            aria-label={`${b.title}, ${b.sub}. Edit commitment`}
            className={cls}
            style={{ top: b.top, height: b.height }}
            onClick={() => setOpenEvent(b.eventId!)}
          >
            {body}
          </button>
        ) : (
          <div key={b.key} title={`${b.title}, ${b.sub} (from your calendar, read-only)`} className={cls} style={{ top: b.top, height: b.height }}>
            {body}
          </div>
        );
      })}
    </div>
  );

  const header = (k: string) => (
    <div key={k} className="border-l border-border px-1 pb-1 text-center">
      <div className={`text-xs font-medium ${k === todayKey ? "text-accent" : "text-muted"}`}>{label(k)}</div>
      {loadOf(k) >= 0.9 * settings.max_hours_per_day && loadOf(k) > 0 && (
        <div className="hatch mt-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-900">Full day: {Math.round(loadOf(k) * 10) / 10} h</div>
      )}
      {deadlinesFor(k).map((a) => (
        <div key={a.id} className="mt-1 flex items-center justify-center gap-1 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-800">
          <Flag size={10} aria-hidden /> <span className="truncate">Due: {a.title}</span>
        </div>
      ))}
    </div>
  );

  const gutter = (
    <div className="relative" style={{ height: hours.length * HOUR_H }}>
      {hours.map((h, i) => (
        <div key={h} className={`absolute right-1 text-[10px] text-muted ${i === 0 ? "translate-y-0.5" : "-translate-y-1.5"}`} style={{ top: i * HOUR_H }}>
          {DateTime.fromObject({ hour: h }).toFormat("h a")}
        </div>
      ))}
    </div>
  );

  const nav = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
      <div className="flex flex-wrap items-center gap-1">
        {undo && (
          <button onClick={undoLast} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium hover:bg-black/5">
            <Undo2 size={15} aria-hidden /> Undo
          </button>
        )}
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium hover:bg-black/5">
          <Plus size={15} aria-hidden /> Commitment
        </button>
        <button onClick={() => { setWeekStart(mondayOnOrBefore(todayKey)); setMobileDay(todayKey); }} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium hover:bg-black/5">
          Today
        </button>
        {!hasPlan && (
          <button
            onClick={generatePlan}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            Generate plan
          </button>
        )}
        <button aria-label="Previous week" className="rounded-lg border border-border bg-card p-1.5" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={16} /></button>
        <span className="hidden px-2 text-sm text-muted md:inline">{rangeLabel}</span>
        <button aria-label="Next week" className="rounded-lg border border-border bg-card p-1.5" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={16} /></button>
      </div>
    </div>
  );

  const legend = (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
      <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-indigo-600" /><Pencil size={11} /> Study session</li>
      <li className="flex items-center gap-1"><span className="hatch inline-block h-3 w-3 rounded-sm bg-slate-200" /><BookOpen size={11} /> Class</li>
      <li className="flex items-center gap-1"><span className="hatch inline-block h-3 w-3 rounded-sm bg-amber-200" /><Briefcase size={11} /> Work</li>
      <li className="flex items-center gap-1"><span className="hatch inline-block h-3 w-3 rounded-sm bg-rose-200" /><Heart size={11} /> Social</li>
      <li className="flex items-center gap-1"><Flag size={11} className="text-red-700" /> Deadline</li>
      <li className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-red-600" /> Now</li>
    </ul>
  );

  return (
    <div>
      {nav}
      {legend}
      <div className="mb-3">
        <Warnings warnings={warnings} compact />
      </div>
      {openSession && <SessionDialog sessionId={openSession} onClose={() => setOpenSession(null)} />}
      {openEvent && <RemoveEventDialog eventId={openEvent} onClose={() => setOpenEvent(null)} />}
      {adding && <AddEventDialog defaultDate={mobileDay} onClose={() => setAdding(false)} />}

      {/* Desktop: full week */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
        <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, minmax(0, 1fr))" }}>
          <div />
          {days.map(header)}
        </div>
        <div className="grid max-h-[calc(100vh-9.5rem)] overflow-y-auto" style={{ gridTemplateColumns: "48px repeat(7, minmax(0, 1fr))" }}>
          {gutter}
          {days.map(renderCol)}
        </div>
      </div>

      {/* Mobile: single day with a date strip */}
      <div className="md:hidden">
        <div className="mb-2 flex gap-1 overflow-x-auto" role="tablist" aria-label="Day">
          {days.map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={k === mobileDay}
              onClick={() => setMobileDay(k)}
              className={`flex min-w-12 flex-1 flex-col items-center rounded-lg px-2 py-1.5 text-xs ${
                k === mobileDay ? "bg-accent text-white" : "border border-border bg-card text-muted"
              }`}
            >
              <span>{DateTime.fromISO(k, { zone }).toFormat("ccc")}</span>
              <span className="font-semibold">{DateTime.fromISO(k, { zone }).toFormat("d")}</span>
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid" style={{ gridTemplateColumns: "40px minmax(0, 1fr)" }}>
            <div />
            {header(days.includes(mobileDay) ? mobileDay : days[0])}
          </div>
          <div className="grid" style={{ gridTemplateColumns: "40px minmax(0, 1fr)" }}>
            {gutter}
            {renderCol(days.includes(mobileDay) ? mobileDay : days[0])}
          </div>
        </div>
      </div>
    </div>
  );
}
