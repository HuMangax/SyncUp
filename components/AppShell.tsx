"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, FileText, GitCompareArrows, House, ListChecks, Settings } from "lucide-react";
import { pendingProposal, usePlanner } from "@/store/planner";
import { DemoPanel } from "./DemoPanel";
import { SupabaseSync } from "./SupabaseSync";
import { A11yApplier } from "./A11yControls";

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

  useEffect(() => {
    void Promise.resolve(usePlanner.persist.rehydrate()).then(() => setReady(true));
  }, []);

  return (
    <div className="min-h-screen md:flex">
      <a href="#main" className="skip-link">Skip to main content</a>
      <A11yApplier />
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col md:bg-blue-950 md:px-4 md:py-6">
        <div className="mb-8 flex items-center gap-2.5 px-2 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500"><CalendarDays size={20} aria-hidden /></span>
          <span className="text-lg font-bold tracking-tight">Study Planner</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold transition-colors ${
                  active ? "bg-white text-blue-900" : "text-blue-100 hover:bg-white/10"
                }`}
              >
                <Icon size={20} aria-hidden /> {label}
                {href === "/preview" && badge > 0 && (
                  <span className="ml-auto grid h-6 min-w-6 place-items-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-blue-950">{badge}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-7">
        {ready && pending && pathname !== "/preview" && (
          <Link
            href="/preview"
            className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-blue-600 px-5 py-3.5 text-white shadow-sm hover:bg-blue-700"
          >
            <span className="font-semibold">
              {changed === 0 ? "Your plan is up to date." : `${changed} study ${changed === 1 ? "session wants" : "sessions want"} to move.`}
            </span>
            <span className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-blue-700">Review</span>
          </Link>
        )}
        {ready ? children : <div className="text-sm text-muted">Loading…</div>}
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
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${active ? "text-blue-700" : "text-muted"}`}
            >
              <Icon size={21} aria-hidden /> {label}
              {href === "/preview" && badge > 0 && <span className="absolute right-3 top-1 h-2.5 w-2.5 rounded-full bg-amber-500" aria-label={`${badge} changes to review`} />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
