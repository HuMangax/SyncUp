"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarDays, CheckCircle2, Download, Loader2, RefreshCw, Unplug } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { secondaryBtn } from "./Modal";

type Status = { configured: boolean; connected: boolean } | null;

/** Ask the server whether Google is set up and connected, and keep the store in step. */
export function useGoogleStatus(enabled = true) {
  const setGoogleConnected = usePlanner((s) => s.setGoogleConnected);
  const [status, setStatus] = useState<Status>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch("/api/calendar?status=1")
      .then((r) => r.json())
      .then((s: Status) => {
        if (!live) return;
        setStatus(s);
        setGoogleConnected(!!s?.connected);
      })
      .catch(() => live && setStatus({ configured: false, connected: false }));
    return () => {
      live = false;
    };
  }, [enabled, setGoogleConnected]);
  return [status, setStatus] as const;
}

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Live sync state as a chip. Icon plus text, so it never relies on color alone. */
export function SyncChip({ compact = false }: { compact?: boolean }) {
  const { googleConnected, syncState, syncNote, lastSyncedAt } = usePlanner();
  if (!googleConnected) return null;
  const view = {
    syncing: { Icon: Loader2, cls: "bg-blue-100 text-blue-900", spin: true, text: "Syncing…" },
    ok: { Icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-900", spin: false, text: lastSyncedAt ? `Synced ${ago(lastSyncedAt)}` : "Synced" },
    error: { Icon: AlertCircle, cls: "bg-amber-100 text-amber-950", spin: false, text: "Not synced" },
    idle: { Icon: CalendarDays, cls: "bg-blue-50 text-blue-900", spin: false, text: "Google connected" },
  }[syncState];
  return (
    <span
      role="status"
      title={syncNote ?? undefined}
      className={`chip-in inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${view.cls}`}
    >
      <view.Icon size={13} aria-hidden className={view.spin ? "animate-spin" : ""} />
      {compact ? view.text : syncNote && syncState === "error" ? syncNote : view.text}
    </span>
  );
}

/** Connect Google Calendar, import busy events, sync study sessions, disconnect. */
export type GoogleStatus = Status;

export function GoogleConnect() {
  const router = useRouter();
  const { now, settings, importGoogleEvents, syncGoogleNow, syncState, setGoogleConnected } = usePlanner();
  const [status, setStatus] = useGoogleStatus();
  const [msg, setMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // The nav links here with #gcal-h. The page renders after load, so scroll once it exists.
  useEffect(() => {
    if (window.location.hash === "#gcal-h") document.getElementById("gcal-h")?.scrollIntoView({ block: "center" });
  }, []);

  const importNow = async () => {
    setImporting(true);
    setMsg("Reading your Google Calendar…");
    const from = new Date(Date.parse(now) - 86_400_000).toISOString();
    const to = new Date(Date.parse(now) + 30 * 86_400_000).toISOString();
    const res = await fetch(`/api/calendar?${new URLSearchParams({ from, to, tz: settings.timezone })}`).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setImporting(false);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="gcal-h" className="flex items-center gap-2 text-xl font-bold">
          <CalendarDays size={22} aria-hidden /> Google Calendar
        </h2>
        <SyncChip compact />
      </div>
      {!status ? (
        <div className="mt-3 space-y-2" aria-label="Checking Google Calendar">
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-9 w-44 rounded-xl" />
        </div>
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
          <p className="text-muted">Until then SyncUp uses its built-in calendar.</p>
        </div>
      ) : status.connected ? (
        <>
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            <li className="flex items-start gap-2"><Download size={16} aria-hidden className="mt-0.5 shrink-0 text-blue-700" /> We only read your events. They are never changed.</li>
            <li className="flex items-start gap-2"><RefreshCw size={16} aria-hidden className="mt-0.5 shrink-0 text-blue-700" /> Study sessions go in a separate “SyncUp” calendar and update each time you accept a plan.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={importNow} disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              {importing ? <Loader2 size={16} aria-hidden className="animate-spin" /> : <Download size={16} aria-hidden />} Import my events
            </button>
            <button type="button" onClick={() => void syncGoogleNow()} disabled={syncState === "syncing"} className={`${secondaryBtn} inline-flex items-center gap-2 disabled:opacity-60`}>
              <RefreshCw size={16} aria-hidden className={syncState === "syncing" ? "animate-spin" : ""} /> Sync now
            </button>
            <button type="button" onClick={disconnect} className={`${secondaryBtn} inline-flex items-center gap-2`}>
              <Unplug size={16} aria-hidden /> Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">Bring in your classes, shifts and plans so study time fits around them. Your study sessions then show up on your phone too.</p>
          <a href="/api/auth/google" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
            <CalendarDays size={16} aria-hidden /> Connect Google Calendar
          </a>
        </>
      )}
      {msg && <p role="status" className="mt-2 text-sm text-muted">{msg}</p>}
    </section>
  );
}
