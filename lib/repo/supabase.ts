import type { SupabaseClient } from "@supabase/supabase-js";
import { fromRows, toRows, type Rows, type StoredState } from "./rows";

const LIST_TABLES = ["assignments", "subtasks", "calendar_events", "study_sessions"] as const;

/**
 * Persistence in Supabase Postgres. Uses the signed-in user's session (anon key + RLS);
 * the service-role key is never needed or shipped to the browser.
 */
export class SupabaseRepo {
  constructor(
    private sb: SupabaseClient,
    private userId: string,
  ) {}

  async load(): Promise<StoredState | null> {
    const app = await this.sb.from("app_state").select("*").eq("user_id", this.userId).maybeSingle();
    if (app.error) throw app.error;
    if (!app.data) return null;
    const settings = await this.sb.from("user_settings").select("*").eq("user_id", this.userId).single();
    if (settings.error) throw settings.error;
    const lists = await Promise.all(LIST_TABLES.map((t) => this.sb.from(t).select("*").eq("user_id", this.userId)));
    for (const l of lists) if (l.error) throw l.error;
    const [assignments, subtasks, calendar_events, study_sessions] = lists.map((l) => (l.data ?? []).map(numeric));
    return fromRows({
      app_state: { ...app.data, anchor: String(app.data.anchor), now: new Date(app.data.now).toISOString() },
      user_settings: numeric(settings.data),
      assignments: assignments.map((a) => ({ ...a, due_at: iso(a.due_at) })),
      subtasks,
      calendar_events: calendar_events.map((e) => ({ ...e, start_at: iso(e.start_at), end_at: iso(e.end_at) })),
      study_sessions: study_sessions.map((x) => ({ ...x, start_at: iso(x.start_at), end_at: iso(x.end_at) })),
    } as Rows);
  }

  /** Upsert everything, then delete rows that no longer exist locally. */
  async save(state: StoredState): Promise<void> {
    const rows = toRows(state, this.userId);
    const one = await Promise.all([
      this.sb.from("app_state").upsert(rows.app_state),
      this.sb.from("user_settings").upsert(rows.user_settings),
    ]);
    for (const r of one) if (r.error) throw r.error;
    for (const t of LIST_TABLES) {
      const list = rows[t] as { id: string }[];
      if (list.length) {
        const up = await this.sb.from(t).upsert(list);
        if (up.error) throw up.error;
      }
      let del = this.sb.from(t).delete().eq("user_id", this.userId);
      if (list.length) del = del.not("id", "in", `(${list.map((x) => `"${x.id.replace(/"/g, "")}"`).join(",")})`);
      const d = await del;
      if (d.error) throw d.error;
    }
  }
}

const iso = (v: unknown) => new Date(String(v)).toISOString();
/** Postgres numeric comes back as a string; turn numeric-looking fields back into numbers. */
function numeric<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of ["estimate_hours", "percent_complete", "remaining_override", "max_hours_per_day"]) {
    if (typeof out[k] === "string") out[k] = Number(out[k]);
  }
  return out as T;
}
