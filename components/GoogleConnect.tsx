"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { secondaryBtn } from "./Modal";

type Status = { configured: boolean; connected: boolean } | null;

/** Connect Google Calendar, import busy events, disconnect. Off in demo mode. */
export function GoogleConnect() {
  const router = useRouter();
  const { now, settings, setGoogleConnected, importGoogleEvents } = usePlanner();
  const [status, setStatus] = useState<Status>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const demo = process.env.NEXT_PUBLIC_DEMO === "1";

  useEffect(() => {
    if (demo) return;
    fetch("/api/calendar?status=1")
      .then((r) => r.json())
      .then((s: Status) => {
        setStatus(s);
        setGoogleConnected(!!s?.connected);
      })
      .catch(() => setStatus({ configured: false, connected: false }));
  }, [demo, setGoogleConnected]);

  const importNow = async () => {
    setMsg("Reading your Google Calendar…");
    const from = new Date(Date.parse(now) - 86_400_000).toISOString();
    const to = new Date(Date.parse(now) + 30 * 86_400_000).toISOString();
    const res = await fetch(`/api/calendar?${new URLSearchParams({ from, to, tz: settings.timezone })}`).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setMsg(json.error ?? "Couldn't reach Google Calendar. Your current calendar is unchanged.");
    importGoogleEvents(json.events);
    router.push("/preview");
  };

  const disconnect = async () => {
    await fetch("/api/auth/google/disconnect", { method: "POST" }).catch(() => null);
    setGoogleConnected(false);
    setStatus((s) => (s ? { ...s, connected: false } : s));
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="gcal-h">
      <h2 id="gcal-h" className="flex items-center gap-1.5 text-sm font-semibold">
        <CalendarDays size={16} aria-hidden /> Google Calendar
      </h2>
      {demo ? (
        <p className="mt-1 text-sm text-muted">Demo mode uses a simulated calendar, so Google Calendar is off.</p>
      ) : !status ? (
        <p className="mt-1 text-sm text-muted">Checking…</p>
      ) : !status.configured ? (
        <p className="mt-1 text-sm text-muted">Google Calendar isn’t set up on this server yet.</p>
      ) : status.connected ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Connected. Your events are only read. Study sessions go into a separate “Study Planner” calendar, and the planner
            never changes anything else.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={importNow} className={secondaryBtn}>Import events</button>
            <button type="button" onClick={disconnect} className={secondaryBtn}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">Bring in your classes, shifts and plans so study time fits around them.</p>
          <a href="/api/auth/google" className={`${secondaryBtn} mt-3 inline-block`}>Connect Google Calendar</a>
        </>
      )}
      {msg && <p role="status" className="mt-2 text-sm text-muted">{msg}</p>}
    </section>
  );
}
