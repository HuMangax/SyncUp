import type { StudySession } from "@/lib/types";

/**
 * Browser side of Google sync. Sends sessions that changed (plus any never synced, so failures
 * retry on the next accept) and the external ids of removed ones. Never blocks accepting a plan.
 */
export async function syncToGoogle(
  tz: string,
  upserts: StudySession[],
  removes: string[],
): Promise<{ synced: Record<string, string>; failed: string[] } | { error: string }> {
  if (upserts.length === 0 && removes.length === 0) return { synced: {}, failed: [] };
  try {
    const res = await fetch("/api/calendar/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tz, upserts, removes }),
    });
    const json = await res.json();
    return res.ok ? json : { error: json.error ?? `HTTP ${res.status}` };
  } catch {
    return { error: "offline" };
  }
}
