"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, ClipboardList, GitCompareArrows, LayoutDashboard, Settings } from "lucide-react";
import { pendingProposal, usePlanner } from "@/store/planner";
import { DemoPanel } from "./DemoPanel";
import { SupabaseSync } from "./SupabaseSync";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/preview", label: "Preview", icon: GitCompareArrows },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const pending = usePlanner((s) => pendingProposal(s.proposals));
  const changed = pending ? pending.diff.filter((e) => e.kind !== "kept").length : 0;

  useEffect(() => {
    void Promise.resolve(usePlanner.persist.rehydrate()).then(() => setReady(true));
  }, []);

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex md:w-56 md:shrink-0 md:flex-col md:border-r md:border-border md:bg-card md:px-3 md:py-5">
        <div className="mb-6 px-3 text-base font-semibold tracking-tight">
          Adaptive Planner
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? "bg-accent-soft text-accent" : "text-muted hover:bg-black/5"
                }`}
              >
                <Icon size={16} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-8">
        {ready && pending && pathname !== "/preview" && (
          <Link
            href="/preview"
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-accent-soft px-4 py-2.5 text-sm text-indigo-950 hover:bg-indigo-100"
          >
            <span>
              <span className="font-semibold">Your plan has updates to review.</span>{" "}
              {changed === 0 ? "Nothing needs to move." : `${changed} session${changed === 1 ? "" : "s"} would change.`}
            </span>
            <span className="shrink-0 font-semibold text-accent">Review changes</span>
          </Link>
        )}
        {ready ? children : <div className="text-sm text-muted">Loading your week…</div>}
      </main>

      {ready && <DemoPanel />}
      {ready && <SupabaseSync />}

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-card md:hidden"
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <Icon size={18} aria-hidden /> {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
