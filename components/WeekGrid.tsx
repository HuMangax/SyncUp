"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { Briefcase, BookOpen, ChevronLeft, ChevronRight, Flag, Heart, Pencil, Pin } from "lucide-react";
import { usePlanner } from "@/store/planner";
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
};

function minutesInDay(iso: string, zone: string, dayKey: string, edge: "start" | "end"): number {
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
  const dayStart = DateTime.fromISO(dayKey, { zone });
  if (edge === "start") return Math.max(0, dt.diff(dayStart, "minutes").minutes);
  return Math.min(24 * 60, dt.diff(dayStart, "minutes").minutes);
}

export function WeekGrid() {
  const { now, events, sessions, assignments, settings } = usePlanner();
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
      if (c) out.push({ key: `${o.event_id}-${o.start_at}`, top: c.top, height: c.height, title: o.title, sub: `${fmt(o.start_at)} – ${fmt(o.end_at)}`, kind: o.kind });
    });
    sessions
      .filter((s: StudySession) => s.status !== "cancelled")
      .forEach((s) => {
        const c = clip(s.start_at, s.end_at);
        if (c) out.push({ key: s.id, top: c.top, height: c.height, title: titleOf(s.assignment_id), sub: `${fmt(s.start_at)} – ${fmt(s.end_at)}`, kind: "study", pinned: s.pinned, status: s.status });
      });
    return out;
  };

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
      {blocksFor(dayKey).map((b) => {
        const study = b.kind === "study";
        const style = study ? null : KIND_STYLE[b.kind as EventKind];
        const Icon = study ? Pencil : style!.Icon;
        return (
          <div
            key={b.key}
            title={`${b.title} · ${b.sub}`}
            className={`absolute inset-x-0.5 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-[11px] leading-tight ${
              study ? "border-indigo-800 bg-indigo-600 text-white shadow-sm" : `${style!.cls} hatch`
            } ${b.status === "missed" ? "opacity-50 line-through" : ""}`}
            style={{ top: b.top, height: b.height }}
          >
            <div className="flex items-center gap-1 font-semibold">
              <Icon size={11} aria-hidden />
              <span className="truncate">{b.title}</span>
              {b.pinned && <Pin size={10} aria-label="Pinned" />}
            </div>
            {b.height > 30 && <div className="truncate opacity-90">{b.sub}</div>}
          </div>
        );
      })}
    </div>
  );

  const header = (k: string) => (
    <div key={k} className="border-l border-border px-1 pb-1 text-center">
      <div className={`text-xs font-medium ${k === todayKey ? "text-accent" : "text-muted"}`}>{label(k)}</div>
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
        <div key={h} className="absolute right-1 -translate-y-1.5 text-[10px] text-muted" style={{ top: i * HOUR_H }}>
          {DateTime.fromObject({ hour: h }).toFormat("h a")}
        </div>
      ))}
    </div>
  );

  const nav = (
    <div className="mb-3 flex items-center justify-between">
      <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
      <div className="flex items-center gap-1">
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
    </ul>
  );

  return (
    <div>
      {nav}
      {legend}

      {/* Desktop: full week */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
        <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, minmax(0, 1fr))" }}>
          <div />
          {days.map(header)}
        </div>
        <div className="grid max-h-[calc(100vh-14rem)] overflow-y-auto" style={{ gridTemplateColumns: "48px repeat(7, minmax(0, 1fr))" }}>
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
