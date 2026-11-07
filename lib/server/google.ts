import { cookies } from "next/headers";
import { GoogleCalendarProvider } from "@/lib/calendar/google";
import { decryptToken, encryptToken } from "./crypto";

/** Google OAuth helpers. Server only: client secret and refresh token never reach the browser. */
export const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"];
export const TOKEN_COOKIE = "gcal";
export const STATE_COOKIE = "gcal_state";

export const googleConfigured = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_TOKEN_SECRET);

export const redirectUri = (origin: string) => `${origin}/api/auth/google/callback`;

export function authUrl(origin: string, state: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  if (!res.ok) throw new Error(`Google token request failed: ${res.status}`);
  return (await res.json()) as { access_token: string; refresh_token?: string };
}

export const exchangeCode = (code: string, origin: string) =>
  tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });

export const sealRefreshToken = (t: string) => encryptToken(t, process.env.GOOGLE_TOKEN_SECRET!);

/** Provider for the signed-in browser, or null if not connected. */
export async function providerFromCookies(timeZone: string): Promise<GoogleCalendarProvider | null> {
  if (!googleConfigured()) return null;
  const sealed = (await cookies()).get(TOKEN_COOKIE)?.value;
  const refresh = sealed ? decryptToken(sealed, process.env.GOOGLE_TOKEN_SECRET!) : null;
  if (!refresh) return null;
  const { access_token } = await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });
  return new GoogleCalendarProvider(access_token, timeZone);
}
