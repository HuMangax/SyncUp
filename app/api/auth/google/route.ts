import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authUrl, googleConfigured, STATE_COOKIE } from "@/lib/server/google";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!googleConfigured()) return NextResponse.json({ error: "Google Calendar is not configured on this server." }, { status: 503 });
  const origin = new URL(request.url).origin;
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(origin, state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https"), maxAge: 600, path: "/" });
  return res;
}
