import { NextResponse } from "next/server";
import { z } from "zod";
import { providerFromCookies } from "@/lib/server/google";

export const runtime = "nodejs";

const Session = z.object({
  id: z.string(),
  assignment_id: z.string(),
  subtask_id: z.string().nullable(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  status: z.literal("scheduled"),
  minutes_done: z.number(),
  pinned: z.boolean(),
  plan_version: z.number(),
  external_id: z.string().optional(),
});
const Body = z.object({ tz: z.string().min(1), upserts: z.array(Session).max(200), removes: z.array(z.string()).max(200) });

/** Push accepted study sessions to the "Study Planner" calendar. Only ever touches tagged events. */
export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid sync request." }, { status: 400 });
  const provider = await providerFromCookies(body.data.tz).catch(() => null);
  if (!provider) return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 401 });

  const synced: Record<string, string> = {};
  const failed: string[] = [];
  for (const s of body.data.upserts) {
    try {
      synced[s.id] = (await provider.upsertSession(s)).externalId;
    } catch {
      failed.push(s.id);
    }
  }
  for (const id of body.data.removes) {
    try {
      await provider.removeSession(id);
    } catch {
      failed.push(id);
    }
  }
  return NextResponse.json({ synced, failed });
}
