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

  useEffect(() => {
    fetch("/api/calendar?status=1")
      .then((r) => r.json())
      .then((s: Status) => {
        setStatus(s);
        setGoogleConnected(!!s?.connected);
      })
      .catch(() => setStatus({ configured: false, connected: false }));
  }, [setGoogleConnected]);

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
    <section className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border" aria-labelledby="gcal-h">
      <h2 id="gcal-h" className="flex items-center gap-2 text-xl font-bold">
        <CalendarDays size={22} aria-hidden /> Google Calendar
      </h2>
      {!status ? (
        <p className="mt-2 text-sm text-muted">Checking…</p>
      ) : !status.configured ? (
        <div className="mt-2 space-y-3 text-sm">
          <p className="text-muted">Google Calendar isn’t set up yet. This takes a few minutes, once:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>In Google Cloud, create an OAuth client (type: web app) and turn on the Google Calendar API.</li>
            <li>
              Add this redirect URL:{" "}
              <code className="break-all rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold">
                {typeof window === "undefined" ? "" : `${window.location.origin}/api/auth/google/callback`}
              </code>
            </li>
            <li>
              Put <code className="rounded bg-blue-50 px-1 text-xs font-semibold">GOOGLE_CLIENT_ID</code>,{" "}
              <code className="rounded bg-blue-50 px-1 text-xs font-semibold">GOOGLE_CLIENT_SECRET</code> and a long random{" "}
              <code className="rounded bg-blue-50 px-1 text-xs font-semibold">GOOGLE_TOKEN_SECRET</code> in <code className="rounded bg-blue-50 px-1 text-xs font-semibold">.env.local</code>, then restart.
            </li>
          </ol>
          <p className="text-muted">Until then the planner uses its built-in calendar.</p>
        </div>
      ) : status.connected ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Connected. We only read your events. Study sessions go in a separate “Study Planner” calendar.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={importNow} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Import my events</button>
            <button type="button" onClick={disconnect} className={secondaryBtn}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">Bring in your classes, shifts and plans so study time fits around them.</p>
          <a href="/api/auth/google" className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Connect Google Calendar</a>
        </>
      )}
      {msg && <p role="status" className="mt-2 text-sm text-muted">{msg}</p>}
    </section>
  );
}
