import { NextResponse } from "next/server";
import { z } from "zod";
import { googleConfigured, providerFromCookies } from "@/lib/server/google";

export const runtime = "nodejs";

const Query = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  tz: z.string().min(1).default("UTC"),
});

/** GET /api/calendar?status=1 -> { configured, connected }; GET /api/calendar?from&to&tz -> busy events. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  if (params.status) {
    const provider = await providerFromCookies("UTC").catch(() => null);
    return NextResponse.json({ configured: googleConfigured(), connected: !!provider });
  }
  const q = Query.safeParse(params);
  if (!q.success) return NextResponse.json({ error: "from and to must be ISO date-times." }, { status: 400 });
  const provider = await providerFromCookies(q.data.tz).catch(() => null);
  if (!provider) return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 401 });
  try {
    return NextResponse.json({ events: await provider.listEvents({ from: q.data.from, to: q.data.to }) });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Google Calendar." }, { status: 502 });
  }
}
