"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePlanner } from "@/store/planner";
import { SettingsInput } from "@/lib/validation";
import type { PreferredWindow, UserSettings } from "@/lib/types";
import { field, primaryBtn } from "@/components/Modal";
import { GoogleConnect } from "@/components/GoogleConnect";
import { AccountPanel } from "@/components/SupabaseSync";

const WINDOWS: { key: string; label: string; w: PreferredWindow }[] = [
  { key: "morning", label: "Mornings (8 am – 12 pm)", w: { start: "08:00", end: "12:00" } },
  { key: "afternoon", label: "Afternoons (12 – 5 pm)", w: { start: "12:00", end: "17:00" } },
  { key: "evening", label: "Evenings (6 – 10 pm)", w: { start: "18:00", end: "22:00" } },
];
const LENGTHS = {
  shorter: { label: "Shorter sessions (about 60 min)", min: 30, target: 60, max: 90 },
  standard: { label: "Standard (about 90 min)", min: 30, target: 90, max: 120 },
  longer: { label: "Longer sessions (about 2 h)", min: 60, target: 120, max: 180 },
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

  const section = "rounded-2xl border border-border bg-card p-5";
  const legend = "text-sm font-semibold";
  const hint = "mt-0.5 text-sm text-muted";

  return (
    <form onSubmit={save} className="mx-auto max-w-2xl space-y-4 pb-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Schedule settings</h1>
        <p className="mt-1 text-sm text-muted">The planner never books study time during sleep, on free days or past your daily max.</p>
      </div>

      <fieldset className={section}>
        <legend className={legend}>Sleep</legend>
        <p className={hint}>Nothing gets scheduled between wind-down and wake-up.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm">Bedtime<input type="time" className={field} value={s.bed_time} onChange={(e) => set("bed_time", e.target.value)} /></label>
          <label className="text-sm">Wake up<input type="time" className={field} value={s.wake_time} onChange={(e) => set("wake_time", e.target.value)} /></label>
          <label className="text-sm">
            Wind-down before bed
            <select className={field} value={s.wind_down_min} onChange={(e) => set("wind_down_min", Number(e.target.value))}>
              {[0, 15, 30, 45, 60].map((m) => <option key={m} value={m}>{m === 0 ? "None" : `${m} min`}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className={legend}>When you like to study</legend>
        <p className={hint}>Preferred times get filled first. Other waking hours are used only when needed.</p>
        <div className="mt-3 space-y-2">
          {WINDOWS.map(({ key, label, w }) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={hasWindow(w)}
                onChange={(e) =>
                  set("preferred_windows", e.target.checked ? [...s.preferred_windows, w] : s.preferred_windows.filter((x) => !(x.start === w.start && x.end === w.end)))
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className={legend}>Workload</legend>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Most study hours in one day
            <input type="number" min={0.5} max={16} step={0.5} className={field} value={s.max_hours_per_day} onChange={(e) => set("max_hours_per_day", Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Break after each session
            <select className={field} value={s.break_min} onChange={(e) => set("break_min", Number(e.target.value))}>
              {[0, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m === 0 ? "No break" : `${m} min`}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Session length">
          {(Object.keys(LENGTHS) as (keyof typeof LENGTHS)[]).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="length"
                className="h-4 w-4 accent-indigo-600"
                checked={lengthKey(s) === k}
                onChange={() => setS((x) => ({ ...x, session_min: LENGTHS[k].min, session_target: LENGTHS[k].target, session_max: LENGTHS[k].max }))}
              />
              {LENGTHS[k].label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className={legend}>Days off</legend>
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
                className={`min-w-14 rounded-lg border px-3 py-1.5 text-sm font-medium ${on ? "border-indigo-600 bg-accent-soft text-indigo-900" : "border-border bg-white text-muted"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className={legend}>Other</legend>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Time zone
            <select className={field} value={s.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {[...new Set([s.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={s.ai_default} onChange={(e) => set("ai_default", e.target.checked)} />
            Suggest breakdowns with AI by default
          </label>
        </div>
      </fieldset>

      <GoogleConnect />
      <AccountPanel />

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="sticky bottom-20 flex justify-end rounded-2xl border border-border bg-card p-3 md:bottom-4">
        <button className={primaryBtn} disabled={!dirty}>Save and review plan</button>
      </div>
    </form>
  );
}
