"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/repo/client";
import { SupabaseRepo } from "@/lib/repo/supabase";
import { usePlanner } from "@/store/planner";
import { secondaryBtn } from "./Modal";

const stored = () => {
  const s = usePlanner.getState();
  return { now: s.now, anchor: s.anchor, settings: s.settings, assignments: s.assignments, subtasks: s.subtasks, sessions: s.sessions, events: s.events, planVersion: s.planVersion };
};

/** Background sync: load on sign-in (or upload local data the first time), then save changes (debounced). */
export function SupabaseSync() {
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let unsub: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = async (user: User | null) => {
      unsub?.();
      unsub = null;
      if (!user) return;
      const repo = new SupabaseRepo(sb, user.id);
      try {
        const remote = await repo.load();
        if (remote) usePlanner.getState().loadStored(remote);
        else await repo.save(stored());
      } catch (e) {
        console.warn("Supabase load failed; staying on local data.", e);
      }
      unsub = usePlanner.subscribe(() => {
        clearTimeout(timer);
        timer = setTimeout(() => void repo.save(stored()).catch((e) => console.warn("Supabase save failed; will retry on the next change.", e)), 1000);
      });
    };
    void sb.auth.getUser().then(({ data }) => start(data.user));
    const { data } = sb.auth.onAuthStateChange((_e, session) => void start(session?.user ?? null));
    return () => {
      unsub?.();
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);
  return null;
}

/** Sign in to save your planner across devices. Hidden when Supabase isn't configured or in demo mode. */
export function AccountPanel() {
  const [user, setUser] = useState<User | null>(null);
  const sb = getSupabase();
  useEffect(() => {
    if (!sb) return;
    void sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [sb]);
  if (!sb) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="acct-h">
      <h2 id="acct-h" className="text-sm font-semibold">Account</h2>
      {user ? (
        <>
          <p className="mt-1 text-sm text-muted">Signed in as {user.email}. Your planner is saved to your account.</p>
          <button type="button" className={`${secondaryBtn} mt-3`} onClick={() => void sb.auth.signOut()}>Sign out</button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">Sign in to keep your planner across devices. Until then it lives in this browser.</p>
          <button
            type="button"
            className={`${secondaryBtn} mt-3`}
            onClick={() => void sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/settings` } })}
          >
            Sign in with Google
          </button>
        </>
      )}
    </section>
  );
}
