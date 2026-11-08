"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, FileText, GitCompareArrows, House, ListChecks, Settings } from "lucide-react";
import { pendingProposal, usePlanner } from "@/store/planner";
import { DemoPanel } from "./DemoPanel";
import { SupabaseSync } from "./SupabaseSync";
import { A11yApplier } from "./A11yControls";
import { Logo } from "./Logo";
import { useGoogleStatus, type GoogleStatus } from "./GoogleConnect";

const NAV = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/assignments", label: "Tasks", icon: ListChecks },
  { href: "/syllabus", label: "Syllabus", icon: FileText },
  { href: "/preview", label: "Review", icon: GitCompareArrows },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const pending = usePlanner((s) => pendingProposal(s.proposals));
  const changed = pending ? pending.diff.filter((e) => e.kind !== "kept").length : 0;
  const badge = ready && pending && changed > 0 ? changed : 0;
  // Checked after rehydration so the server's answer is not overwritten by stored state.
  const [google] = useGoogleStatus(ready);

  useEffect(() => {
    void Promise.resolve(usePlanner.persist.rehydrate()).then(() => setReady(true));
  }, []);

  return (
    <div className="min-h-screen md:flex">
      <a href="#main" className="skip-link">Skip to main content</a>
      <A11yApplier />
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:overflow-y-auto md:bg-blue-950 md:px-4 md:py-6">
        <Link href="/dashboard" aria-label="SyncUp home" className="mb-8 px-2">
          <Logo light />
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold transition-colors ${
                  active ? "bg-white text-blue-900" : "text-blue-100 hover:bg-white/10"
                }`}
              >
                <Icon size={20} aria-hidden /> {label}
                {href === "/preview" && badge > 0 && (
                  <span key={badge} className="badge-ping ml-auto grid h-6 min-w-6 place-items-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-blue-950">{badge}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <GoogleNavStatus status={google} />
      </aside>

      {/* Phone header: brand plus calendar link status. */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/90 px-4 py-2.5 backdrop-blur md:hidden">
        <Link href="/dashboard" aria-label="SyncUp home"><Logo size={30} /></Link>
        <GoogleNavStatus status={google} compact />
      </header>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-7">
        {ready && pending && pathname !== "/preview" && (
          <Link
            href="/preview"
            className="banner-in press mb-5 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-3.5 text-white shadow-md shadow-blue-600/20 hover:from-blue-700 hover:to-blue-800"
          >
            <span className="font-semibold">
              {changed === 0 ? "Your plan is up to date." : `${changed} study ${changed === 1 ? "session wants" : "sessions want"} to move.`}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-blue-700">Review <ArrowRight size={15} aria-hidden className="nudge" /></span>
          </Link>
        )}
        {ready ? (
          <div key={pathname} className="page-in">{children}</div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-4" aria-busy="true" aria-label="Loading">
            <div className="skeleton h-9 w-56 rounded-xl" />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="skeleton h-36 rounded-3xl" />
              <div className="skeleton h-36 rounded-3xl" />
              <div className="skeleton h-36 rounded-3xl" />
            </div>
            <div className="skeleton h-72 rounded-3xl" />
          </div>
        )}
      </main>

      {ready && <DemoPanel />}
      {ready && <SupabaseSync />}

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-card md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`nav-link relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors ${active ? "text-blue-700" : "text-muted"}`}
            >
              <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? "bg-blue-100" : ""}`}><Icon size={20} aria-hidden /></span>
              {label}
              {href === "/preview" && badge > 0 && <span key={badge} className="badge-ping absolute right-3 top-1 h-2.5 w-2.5 rounded-full bg-amber-500" aria-label={`${badge} changes to review`} />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Where the student's real calendar stands. Links to the Google card in Settings. */
function GoogleNavStatus({ status, compact = false }: { status: GoogleStatus; compact?: boolean }) {
  const syncState = usePlanner((s) => s.syncState);
  if (!status) return null;
  const connected = status.connected;
  const label = !connected ? "Connect Google" : syncState === "syncing" ? "Syncing…" : syncState === "error" ? "Sync paused" : "Google synced";
  const dot = !connected ? "bg-slate-400" : syncState === "error" ? "bg-amber-400" : "bg-emerald-400";
  if (compact)
    return (
      <Link href="/settings#gcal-h" className="press inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-blue-900">
        <span className={`h-2 w-2 rounded-full ${dot} ${syncState === "syncing" ? "animate-pulse" : ""}`} aria-hidden />
        <CalendarDays size={14} aria-hidden /> {label}
      </Link>
    );
  return (
    <Link
      href="/settings#gcal-h"
      className="press mt-auto flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3 text-sm font-semibold text-blue-100 ring-1 ring-white/10 hover:bg-white/10"
    >
      <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-white/10">
        <CalendarDays size={17} aria-hidden />
        <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-blue-950 ${dot} ${syncState === "syncing" ? "animate-pulse" : ""}`} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-white">Google Calendar</span>
        <span className="block text-xs font-medium text-blue-200">{label}</span>
      </span>
    </Link>
  );
}
