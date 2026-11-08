import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { breakdown, breakdownPrompt, BreakdownRequest, MODEL_JSON_SCHEMA } from "@/lib/ai/breakdown";
import { createRateLimiter } from "@/lib/ai/rateLimit";
import { geminiCaller } from "@/lib/ai/gemini";

export const runtime = "nodejs";

const allow = createRateLimiter(10, 60_000); // 10 breakdowns per minute per IP
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/**
 * POST /api/breakdown. The API key never leaves the server. Only assignment text goes to the
 * model: never calendar events, never dates. Any failure returns the deterministic template.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(ip, Date.now())) {
    return NextResponse.json({ error: "Too many breakdown requests. Try again in a minute." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const parsed = BreakdownRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message, path: parsed.error.issues[0].path }, { status: 400 });
  }
  const req = parsed.data;

  // Providers in order. AI_PROVIDER=gemini puts Gemini first; otherwise Claude leads and Gemini
  // is the backup. Either one failing just moves on; all failing returns the template.
  const offline = process.env.NEXT_PUBLIC_DEMO === "offline";
  type Provider = { name: "claude" | "gemini"; call: (retryNote?: string) => Promise<string> };
  const providers: Provider[] = [];
  if (!offline && process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ maxRetries: 0, timeout: 8_000 });
    providers.push({
      name: "claude",
      call: async (retryNote) => {
        const res = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 4000,
          // On a policy decline the API re-runs the request on a fallback model in the same call.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low", format: { type: "json_schema", schema: MODEL_JSON_SCHEMA } },
          messages: [{ role: "user", content: breakdownPrompt(req, retryNote) }],
        });
        if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(`stop: ${res.stop_reason}`);
        return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      },
    });
  }
  if (!offline && process.env.GEMINI_API_KEY) {
    const gemini = geminiCaller({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || undefined });
    providers.push({ name: "gemini", call: (retryNote) => gemini(breakdownPrompt(req, retryNote)) });
  }
  if (process.env.AI_PROVIDER === "gemini") providers.sort((a) => (a.name === "gemini" ? -1 : 1));

  let used: Provider["name"] | null = null;
  const callModel = providers.length
    ? async (retryNote?: string) => {
        let last: unknown;
        for (const p of providers) {
          try {
            const text = await p.call(retryNote);
            used = p.name;
            return text;
          } catch (e) {
            last = e;
          }
        }
        throw last;
      }
    : undefined;

  const result = await breakdown(req, { callModel, timeoutMs: providers.length > 1 ? 14_000 : 8_000 });
  return NextResponse.json({ ...result, ...(result.source === "ai" && used ? { provider: used } : {}) });
}
