import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, googleConfigured, sealRefreshToken, STATE_COOKIE, TOKEN_COOKIE } from "@/lib/server/google";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?google=${q}`, url.origin));
  if (!googleConfigured()) return back("not-configured");
  const jar = await cookies();
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!code || !state || state !== jar.get(STATE_COOKIE)?.value) return back("denied");
  try {
    const tokens = await exchangeCode(code, url.origin);
    if (!tokens.refresh_token) return back("no-refresh-token");
    const res = back("connected");
    res.cookies.set(TOKEN_COOKIE, sealRefreshToken(tokens.refresh_token), {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
    });
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch {
    return back("error");
  }
}
