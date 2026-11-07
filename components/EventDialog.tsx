"use client";

import { useState } from "react";
import { EventInput } from "@/lib/validation";
import type { EventKind } from "@/lib/types";
import { usePlanner } from "@/store/planner";
import { Modal, field, labelCls, primaryBtn, secondaryBtn } from "./Modal";

/** Add a commitment (class, shift, plans) to the simulated calendar. */
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
    <Modal title="Add a commitment" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <label className={labelCls}>
          What is it?
          <input className={field} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Volunteer shift" />
        </label>
        <label className={labelCls}>
          Kind
          <select className={field} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as EventKind })}>
            <option value="class">Class</option>
            <option value="work">Work</option>
            <option value="social">Social</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className={labelCls}>Date<input type="date" className={field} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></label>
          <label className={labelCls}>Starts<input type="time" className={field} value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} /></label>
          <label className={labelCls}>Ends<input type="time" className={field} value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={d.weekly} onChange={(e) => setD({ ...d, weekly: e.target.checked })} />
          Repeats every week
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <p className="text-xs text-muted">Study sessions that clash will move. You’ll review the change first.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button className={primaryBtn}>Add commitment</button>
        </div>
      </form>
    </Modal>
  );
}

export function RemoveEventDialog({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const { events, deleteEvent } = usePlanner();
  const ev = events.find((e) => e.id === eventId);
  if (!ev) return null;
  return (
    <Modal title={ev.title} onClose={onClose}>
      <p className="text-sm text-muted">{ev.rule ? "This repeats every week." : "One-off commitment."} You added it in this app, so you can remove it.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={secondaryBtn}>Keep it</button>
        <button
          onClick={() => {
            deleteEvent(ev.id);
            onClose();
          }}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
        >
          Remove commitment
        </button>
      </div>
    </Modal>
  );
}
