"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { CalendarDays, ChevronLeft, ChevronRight, Flag, Lock, LockOpen, Plus, Undo2 } from "lucide-react";
import { KIND_STYLE } from "./kinds";
import { usePlanner } from "@/store/planner";
import { SessionDialog } from "./SessionDialog";
import { Warnings } from "./Warnings";
import { AddEventDialog, EventActionsDialog } from "./EventDialog";
import { GoogleConnect, SyncChip } from "./GoogleConnect";
import { Modal } from "./Modal";
import { expandEvents } from "@/lib/calendar/simulated";
import { addDays, localDateKey, localToUtc, mondayOnOrBefore } from "@/lib/time/slots";
import type { EventKind, EventOccurrence, StudySession } from "@/lib/types";

const HOUR_H = 56; // px per hour
const GRID_START = 6; // 06:00
const GRID_END = 24;

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
  startAt?: string;
  cancelled?: boolean;
};

function minutesInDay(iso: string, zone: string, dayKey: string, edge: "start" | "end"): number {
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
  const dayStart = DateTime.fromISO(dayKey, { zone });
  if (edge === "start") return Math.max(0, dt.diff(dayStart, "minutes").minutes);
  return Math.min(24 * 60, dt.diff(dayStart, "minutes").minutes);
}

export function WeekGrid() {
  const { now, events, sessions, assignments, subtasks, settings, warnings, generatePlan, lastChanged, undo, undoLast, togglePin, restoreOccurrence, moveSession } = usePlanner();
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<{ id: string; startAt: string } | null>(null);
  // Dragging a study block: offset in px, plus the snapped time it would land on.
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; label: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; top: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const [adding, setAdding] = useState(false);
  const [google, setGoogle] = useState(false);
  // "Lock times" mode: clicking a study block flips whether the planner may move it.
  const [lockMode, setLockMode] = useState(false);
  // Highlight sessions that the last accepted proposal moved or added, for a few seconds.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!lastChanged || Date.now() - lastChanged.at > 8000) return;
    setFresh(new Set(lastChanged.ids));
    const t = setTimeout(() => setFresh(new Set()), 4000);
    return () => clearTimeout(t);
  }, [lastChanged]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
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
        { includeCancelled: true },
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
      if (c) out.push({ key: `${o.event_id}-${o.start_at}`, top: c.top, height: c.height, title: o.title, sub: `${fmt(o.start_at)} – ${fmt(o.end_at)}`, kind: o.kind, eventId: o.event_id, startAt: o.start_at, cancelled: o.cancelled });
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

  const SNAP = 15;
  const startDrag = (e: React.PointerEvent<HTMLButtonElement>, b: Block) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, top: b.top, moved: false };
    justDragged.current = false;
  };
  /** Where the block would land: snapped start minutes and the day column under the pointer. */
  const target = (e: React.PointerEvent, b: Block, d: { x: number; y: number; top: number }) => {
    const dy = e.clientY - d.y;
    const mins = GRID_START * 60 + ((d.top + dy) / HOUR_H) * 60;
    const snapped = Math.round(mins / SNAP) * SNAP;
    let day: string | null = null;
    document.querySelectorAll<HTMLElement>("[data-day]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX < r.right) day = el.dataset.day ?? null;
    });
    const startMin = Math.max(0, snapped);
    return { day: day ?? localDateKey(sessions.find((x) => x.id === b.sessionId)!.start_at, zone), startMin, dy, dx: e.clientX - d.x };
  };
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const moveDrag = (e: React.PointerEvent<HTMLButtonElement>, b: Block) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    d.moved = true;
    const t = target(e, b, d);
    setDrag({ id: b.sessionId!, dx: t.dx, dy: t.dy, label: DateTime.fromISO(`${t.day}T${hm(t.startMin)}`, { zone }).toFormat("ccc h:mm a") });
  };
  const endDrag = (e: React.PointerEvent<HTMLButtonElement>, b: Block) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !d.moved) return;
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    const t = target(e, b, d);
    setDrag(null);
    const r = moveSession(b.sessionId!, localToUtc(t.day, hm(t.startMin), zone));
    setToast(r.ok ? "Moved and locked in place." : r.reason);
  };

  const renderCol = (dayKey: string) => (
    <div key={dayKey} data-day={dayKey} className="relative border-l border-border" style={{ height: hours.length * HOUR_H, "--d": Math.max(0, days.indexOf(dayKey)) } as React.CSSProperties}>
      {hours.map((h, i) => (
        <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * HOUR_H }} />
      ))}
      {dayKey === todayKey && (() => {
        const m = minutesInDay(now, zone, dayKey, "start");
        if (m < GRID_START * 60 || m >= GRID_END * 60) return null;
        return (
          <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: ((m - GRID_START * 60) / 60) * HOUR_H }} aria-hidden>
            <span className="now-dot -ml-1 h-2 w-2 rounded-full bg-red-600" />
            <span className="h-px flex-1 bg-red-600" />
          </div>
        );
      })()}
      {blocksFor(dayKey).map((b) => {
        const study = b.kind === "study";
        const style = KIND_STYLE[b.kind];
        const Icon = style.Icon;
        const isFresh = !!b.sessionId && fresh.has(b.sessionId);
        const cls = `absolute inset-x-0.5 overflow-hidden rounded-md border-l-4 ${isFresh ? "just-moved z-10" : "block-in"} px-2 py-1 text-left text-xs leading-tight ${
          study ? "border-blue-900 bg-blue-600 text-white shadow-sm hover:bg-blue-700" : style.card
        } ${b.status === "missed" ? "opacity-50 line-through" : ""} ${b.status === "completed" ? "bg-blue-400" : ""}`;
        const body = (
          <>
            <div className="flex items-center gap-1 font-semibold">
              <Icon size={12} aria-hidden />
              <span className="truncate">{b.title}</span>
              {study && (lockMode || b.pinned) && (b.pinned ? <Lock size={12} aria-label="Fixed time" className="ml-auto shrink-0" /> : <LockOpen size={12} aria-label="Movable" className="ml-auto shrink-0 opacity-70" />)}
              {b.status && b.status !== "scheduled" && <span className="sr-only">({b.status})</span>}
            </div>
            {isFresh && <span className="absolute right-1 top-0.5 rounded bg-white px-1 text-[9px] font-bold text-blue-900">Updated</span>}
            {b.height > 34 && <div className="truncate opacity-90">{b.sub}</div>}
          </>
        );
        const dragging = drag && drag.id === b.sessionId ? drag : null;
        if (study) {
          const canDrag = !lockMode && b.status === "scheduled";
          return (
            <button
              key={b.key}
              title={`${b.title} · ${b.sub}`}
              aria-label={`${b.title}, ${b.sub}${b.pinned ? ", fixed" : ", movable"}${b.status && b.status !== "scheduled" ? `, ${b.status}` : ""}. ${lockMode ? "Toggle fixed time" : "Open session"}`}
              className={`${cls} ${canDrag ? "md:cursor-grab md:touch-none" : ""} ${dragging ? "!cursor-grabbing z-40 shadow-xl ring-2 ring-white transition-none" : "transition-shadow"}`}
              style={{ top: b.top, height: b.height, transform: dragging ? `translate(${dragging.dx}px, ${dragging.dy}px)` : undefined }}
              onClick={() => {
                if (justDragged.current) return;
                if (lockMode) togglePin(b.sessionId!);
                else setOpenSession(b.sessionId!);
              }}
              onPointerDown={canDrag ? (e) => startDrag(e, b) : undefined}
              onPointerMove={canDrag ? (e) => moveDrag(e, b) : undefined}
              onPointerUp={canDrag ? (e) => endDrag(e, b) : undefined}
              onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
            >
              {body}
              {dragging && <span className="absolute inset-x-1 bottom-0.5 rounded bg-white px-1 text-center text-[11px] font-bold text-blue-900">{dragging.label}</span>}
            </button>
          );
        }
        if (b.cancelled)
          return (
            <button
              key={b.key}
              aria-label={`${b.title}, ${b.sub}, cancelled. Restore`}
              title="Cancelled. Tap to restore."
              className="block-in absolute inset-x-0.5 overflow-hidden rounded-md border-2 border-dashed border-slate-300 px-2 py-1 text-left text-xs leading-tight text-slate-400 hover:bg-slate-50"
              style={{ top: b.top, height: b.height }}
              onClick={() => restoreOccurrence(b.eventId!, b.startAt!)}
            >
              <div className="flex items-center gap-1 font-semibold line-through"><Icon size={12} aria-hidden /><span className="truncate">{b.title}</span></div>
              {b.height > 34 && <div>Cancelled · restore</div>}
            </button>
          );
        return (
          <button
            key={b.key}
            aria-label={`${b.title}, ${b.sub}. Options`}
            className={`${cls} hover:brightness-95`}
            style={{ top: b.top, height: b.height }}
            onClick={() => setOpenEvent({ id: b.eventId!, startAt: b.startAt! })}
          >
            {body}
          </button>
        );
      })}
    </div>
  );

  const header = (k: string) => (
    <div key={k} className="border-l border-border px-1 pb-1 text-center">
      <div className={`text-sm font-semibold ${k === todayKey ? "text-blue-700" : "text-muted"}`}>{label(k)}</div>
      {loadOf(k) >= 0.9 * settings.max_hours_per_day && loadOf(k) > 0 && (
        <div className="mt-1 rounded bg-amber-100 px-1 py-0.5 text-[11px] font-semibold text-amber-900">Full day: {Math.round(loadOf(k) * 10) / 10} h</div>
      )}
      {deadlinesFor(k).map((a) => (
        <div key={a.id} className="mt-1 flex items-center justify-center gap-1 rounded bg-red-100 px-1 py-0.5 text-[11px] font-semibold text-red-800">
          <Flag size={10} aria-hidden /> <span className="truncate">Due: {a.title}</span>
        </div>
      ))}
    </div>
  );

  const gutter = (
    <div className="relative" style={{ height: hours.length * HOUR_H }}>
      {hours.map((h, i) => (
        <div key={h} className={`absolute right-1 text-[11px] text-muted ${i === 0 ? "translate-y-0.5" : "-translate-y-1.5"}`} style={{ top: i * HOUR_H }}>
          {DateTime.fromObject({ hour: h }).toFormat("h a")}
        </div>
      ))}
    </div>
  );

  const pill = "inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold hover:bg-blue-50";
  const nav = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted md:hidden">{rangeLabel}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {undo && (
          <button onClick={undoLast} className={pill}><Undo2 size={16} aria-hidden /> Undo</button>
        )}
        <button
          onClick={() => setLockMode((v) => !v)}
          aria-pressed={lockMode}
          className={`${pill} ${lockMode ? "!border-blue-700 !bg-blue-700 text-white hover:!bg-blue-800" : ""}`}
        >
          {lockMode ? <Lock size={16} aria-hidden /> : <LockOpen size={16} aria-hidden />} {lockMode ? "Done locking" : "Lock times"}
        </button>
        <button onClick={() => setGoogle(true)} className={pill}><CalendarDays size={16} aria-hidden /> Google</button>
        <button onClick={() => setAdding(true)} className={pill}><Plus size={16} aria-hidden /> Add event</button>
        {!hasPlan && (
          <button onClick={generatePlan} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700">Make my plan</button>
        )}
        <div className="flex items-center gap-1">
          <button aria-label="Previous week" className="rounded-xl border border-border bg-card p-2 hover:bg-blue-50" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={18} /></button>
          <button onClick={() => { setWeekStart(mondayOnOrBefore(todayKey)); setMobileDay(todayKey); }} className={pill}>Today</button>
          <span className="hidden px-2 text-sm font-semibold text-muted lg:inline">{rangeLabel}</span>
          <button aria-label="Next week" className="rounded-xl border border-border bg-card p-2 hover:bg-blue-50" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={18} /></button>
        </div>
      </div>
    </div>
  );

  const chip = (k: keyof typeof KIND_STYLE) => {
    const { Icon, chip: c, label } = KIND_STYLE[k];
    return (
      <li key={k} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${c}`}><Icon size={13} aria-hidden /> {label}</li>
    );
  };
  const legend = (
    <ul className="mb-4 flex flex-wrap items-center gap-2" aria-label="Legend">
      {(["study", "class", "work", "social", "other"] as const).map(chip)}
      <li className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800"><Flag size={13} aria-hidden /> Due</li>
      <li className="flex items-center gap-1.5 px-2 text-xs text-muted"><Lock size={13} aria-hidden /> Fixed · <LockOpen size={13} aria-hidden /> Movable</li>
      <li className="ml-auto"><SyncChip /></li>
    </ul>
  );

  return (
    <div>
      {nav}
      {legend}
      <div className="mb-3">
        <Warnings warnings={warnings} compact />
      </div>
      {toast && <p key={toast} role="status" className="toast-in mb-3 rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white">{toast}</p>}
      {lockMode && (
        <p role="status" className="toast-in mb-3 rounded-xl bg-blue-100 px-4 py-2.5 text-sm font-semibold text-blue-900">
          Tap a study block to lock or unlock it. Locked blocks never move.
        </p>
      )}
      {openSession && <SessionDialog sessionId={openSession} onClose={() => setOpenSession(null)} />}
      {openEvent && <EventActionsDialog eventId={openEvent.id} startAt={openEvent.startAt} onClose={() => setOpenEvent(null)} />}
      {google && <Modal title="Google Calendar" onClose={() => setGoogle(false)} wide><GoogleConnect /></Modal>}
      {adding && <AddEventDialog defaultDate={mobileDay} onClose={() => setAdding(false)} />}

      {/* Desktop: full week */}
      <div className="hidden overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border md:block">
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
                k === mobileDay ? "bg-blue-600 text-white" : "border border-border bg-card text-muted"
              }`}
            >
              <span>{DateTime.fromISO(k, { zone }).toFormat("ccc")}</span>
              <span className="font-semibold">{DateTime.fromISO(k, { zone }).toFormat("d")}</span>
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border">
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
