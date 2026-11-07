import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { breakdown, breakdownPrompt, BreakdownRequest, MODEL_JSON_SCHEMA } from "@/lib/ai/breakdown";
import { createRateLimiter } from "@/lib/ai/rateLimit";

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

  const hasKey = !!process.env.ANTHROPIC_API_KEY && process.env.NEXT_PUBLIC_DEMO !== "offline";
  const client = hasKey ? new Anthropic({ maxRetries: 0, timeout: 8_000 }) : null;

  const callModel = client
    ? async (retryNote?: string) => {
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
      }
    : undefined;

  const result = await breakdown(req, { callModel, timeoutMs: 8_000 });
  return NextResponse.json(result);
}
