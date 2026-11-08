"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePlanner } from "@/store/planner";
import { SettingsInput } from "@/lib/validation";
import type { PreferredWindow, UserSettings } from "@/lib/types";
import { field, primaryBtn } from "@/components/Modal";
import { GoogleConnect } from "@/components/GoogleConnect";
import { A11yControls } from "@/components/A11yControls";
import Link from "next/link";
import { AccountPanel } from "@/components/SupabaseSync";

const WINDOWS: { key: string; label: string; w: PreferredWindow }[] = [
  { key: "morning", label: "Mornings (8 am – 12 pm)", w: { start: "08:00", end: "12:00" } },
  { key: "afternoon", label: "Afternoons (12 – 5 pm)", w: { start: "12:00", end: "17:00" } },
  { key: "evening", label: "Evenings (6 – 10 pm)", w: { start: "18:00", end: "22:00" } },
];
const LENGTHS = {
  shorter: { label: "Short (about 60 min)", min: 30, target: 60, max: 90 },
  standard: { label: "Standard (about 90 min)", min: 30, target: 90, max: 120 },
  longer: { label: "Long (about 2 h)", min: 60, target: 120, max: 180 },
} as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ZONES = ["America/Vancouver", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/Toronto", "America/New_York", "Europe/London", "Asia/Singapore", "Australia/Sydney"];

const lengthKey = (s: UserSettings) =>
  (Object.keys(LENGTHS) as (keyof typeof LENGTHS)[]).find((k) => LENGTHS[k].target === s.session_target) ?? "standard";

export default function SettingsPage() {
  const router = useRouter();
  const { settings, updateSettings } = usePlanner();
  const [s, setS] = useState<UserSettings>(settings);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const hasWindow = (w: PreferredWindow) => s.preferred_windows.some((x) => x.start === w.start && x.end === w.end);
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const r = SettingsInput.safeParse(s);
    if (!r.success) {
      setError(r.error.issues[0].message);
      return;
    }
    setError(null);
    updateSettings(r.data);
    router.push("/preview");
  };

  const section = "rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border";
  const legend = "text-xl font-bold";
  const hint = "mt-1 text-sm text-muted";

  return (
    <form onSubmit={save} className="mx-auto max-w-2xl space-y-4 pb-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Study time never lands on sleep, free days or past your daily limit.</p>
      </div>

      <section className={section}>
        <h2 className={legend}>Sleep</h2>
        <p className={hint}>Nothing gets scheduled between wind-down and wake-up.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold">Bedtime<input type="time" className={field} value={s.bed_time} onChange={(e) => set("bed_time", e.target.value)} /></label>
          <label className="text-sm font-semibold">Wake up<input type="time" className={field} value={s.wake_time} onChange={(e) => set("wake_time", e.target.value)} /></label>
          <label className="text-sm font-semibold">
            Wind-down before bed
            <select className={field} value={s.wind_down_min} onChange={(e) => set("wind_down_min", Number(e.target.value))}>
              {[0, 15, 30, 45, 60].map((m) => <option key={m} value={m}>{m === 0 ? "None" : `${m} min`}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className={section}>
        <h2 className={legend}>When you like to study</h2>
        <p className={hint}>Preferred times get filled first. Other waking hours are used only when needed.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {WINDOWS.map(({ key, label, w }) => {
            const on = hasWindow(w);
            const [name, range] = label.split(" (");
            return (
              <button
                type="button"
                key={key}
                aria-pressed={on}
                onClick={() => set("preferred_windows", on ? s.preferred_windows.filter((x) => !(x.start === w.start && x.end === w.end)) : [...s.preferred_windows, w])}
                className={`rounded-2xl border-2 p-4 text-left transition ${on ? "border-blue-600 bg-blue-50" : "border-border bg-white hover:border-blue-300"}`}
              >
                <span className="flex items-center justify-between font-bold">{name}{on && <Check size={18} className="text-blue-600" aria-hidden />}</span>
                <span className="text-sm text-muted">{range?.replace(")", "")}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={section}>
        <h2 className={legend}>Workload</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Most study hours in one day
            <input type="number" min={0.5} max={16} step={0.5} className={field} value={s.max_hours_per_day} onChange={(e) => set("max_hours_per_day", Number(e.target.value))} />
          </label>
          <label className="text-sm font-semibold">
            Break after each session
            <select className={field} value={s.break_min} onChange={(e) => set("break_min", Number(e.target.value))}>
              {[0, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m === 0 ? "No break" : `${m} min`}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Session length">
          {(Object.keys(LENGTHS) as (keyof typeof LENGTHS)[]).map((k) => {
            const on = lengthKey(s) === k;
            const [name, detail] = LENGTHS[k].label.split(" (");
            return (
              <button
                type="button"
                key={k}
                role="radio"
                aria-checked={on}
                onClick={() => setS((x) => ({ ...x, session_min: LENGTHS[k].min, session_target: LENGTHS[k].target, session_max: LENGTHS[k].max }))}
                className={`rounded-2xl border-2 p-4 text-left transition ${on ? "border-blue-600 bg-blue-50" : "border-border bg-white hover:border-blue-300"}`}
              >
                <span className="flex items-center justify-between font-bold">{name}{on && <Check size={18} className="text-blue-600" aria-hidden />}</span>
                <span className="text-sm text-muted">{detail?.replace(")", "") ?? ""}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={section}>
        <h2 className={legend}>Days off</h2>
        <p className={hint}>No study sessions on these days.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAYS.map((d, i) => {
            const on = s.free_days.includes(i);
            return (
              <button
                type="button"
                key={d}
                aria-pressed={on}
                onClick={() => set("free_days", on ? s.free_days.filter((x) => x !== i) : [...s.free_days, i].sort())}
                className={`min-w-16 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition ${on ? "border-blue-600 bg-blue-600 text-white" : "border-border bg-white text-muted hover:border-blue-300"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </section>

      <section className={section}>
        <h2 className={legend}>Other</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Time zone
            <select className={field} value={s.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {[...new Set([s.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={s.ai_default} onChange={(e) => set("ai_default", e.target.checked)} />
            Suggest breakdowns with AI by default
          </label>
        </div>
      </section>

      <section className={section} aria-labelledby="a11y-h">
        <h2 id="a11y-h" className={legend}>Accessibility</h2>
        <p className={hint}>Changes apply right away and stay on this device.</p>
        <div className="mt-4"><A11yControls /></div>
        <p className="mt-5 text-sm"><Link href="/accessibility" className="font-semibold text-blue-700 underline">How this app supports accessibility</Link></p>
      </section>

      <GoogleConnect />
      <AccountPanel />

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="sticky bottom-20 flex justify-end rounded-3xl bg-card shadow-sm ring-1 ring-border p-3 md:bottom-4">
        <button className={primaryBtn} disabled={!dirty}>Save and review plan</button>
      </div>
    </form>
  );
}
