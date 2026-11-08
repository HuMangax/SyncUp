"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { EventInput } from "@/lib/validation";
import type { EventKind } from "@/lib/types";
import { usePlanner } from "@/store/planner";
import { Modal, field, labelCls, primaryBtn, secondaryBtn } from "./Modal";

/** Add an event (class, shift, plans) to the simulated calendar. */
export function AddEventDialog({ defaultDate, onClose }: { defaultDate: string; onClose: () => void }) {
  const addEvent = usePlanner((s) => s.addEvent);
  const [d, setD] = useState({ title: "", kind: "social" as EventKind, date: defaultDate, start: "18:00", end: "20:00", weekly: false });
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = EventInput.safeParse(d);
    if (!r.success) return setError(r.error.issues[0].message);
    addEvent(r.data);
    onClose();
  };
  return (
    <Modal title="Add an event" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <label className={labelCls}>
          Name
          <input className={field} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Volunteer shift" />
        </label>
        <label className={labelCls}>
          Type
          <select className={field} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as EventKind })}>
            <option value="class">Class</option>
            <option value="work">Work</option>
            <option value="social">Hangout</option>
            <option value="other">Other event</option>
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className={labelCls}>Date<input type="date" className={field} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></label>
          <label className={labelCls}>Starts<input type="time" className={field} value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} /></label>
          <label className={labelCls}>Ends<input type="time" className={field} value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={d.weekly} onChange={(e) => setD({ ...d, weekly: e.target.checked })} />
          Repeats every week
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <p className="text-xs text-muted">Study sessions in the way will move. You review first.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button className={primaryBtn}>Add event</button>
        </div>
      </form>
    </Modal>
  );
}

/** Options for one block on the calendar: cancel just this day, or (for events you added) remove it. */
export function EventActionsDialog({ eventId, startAt, onClose }: { eventId: string; startAt: string; onClose: () => void }) {
  const { events, deleteEvent, cancelOccurrence, settings } = usePlanner();
  const ev = events.find((e) => e.id === eventId);
  if (!ev) return null;
  const when = DateTime.fromISO(startAt, { zone: "utc" }).setZone(settings.timezone).toFormat("cccc, LLL d");
  const mine = ev.id.startsWith("ev-user-");
  return (
    <Modal title={ev.title} onClose={onClose}>
      <p className="text-base text-muted">{when}</p>
      <div className="mt-5 grid gap-2">
        <button
          onClick={() => { cancelOccurrence(eventId, startAt); onClose(); }}
          className="rounded-xl bg-blue-600 px-5 py-3 text-base font-bold text-white hover:bg-blue-700"
        >
          Cancel this one
        </button>
        <p className="text-center text-xs text-muted">Only {when}. The time opens up for study. You can restore it.</p>
        {mine && ev.rule && (
          <button
            onClick={() => { deleteEvent(ev.id); onClose(); }}
            className="rounded-xl border border-red-200 px-5 py-3 text-base font-semibold text-red-700 hover:bg-red-50"
          >
            Remove every week
          </button>
        )}
        {mine && !ev.rule && (
          <button
            onClick={() => { deleteEvent(ev.id); onClose(); }}
            className="rounded-xl border border-red-200 px-5 py-3 text-base font-semibold text-red-700 hover:bg-red-50"
          >
            Delete event
          </button>
        )}
        <button onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-muted hover:bg-blue-50">Keep it</button>
      </div>
    </Modal>
  );
}
