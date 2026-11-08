import { MODEL_JSON_SCHEMA } from "./breakdown";

/**
 * Gemini as a second model for the assignment breakdown. Same contract as the Claude call:
 * it gets only the assignment text and returns JSON text that normalize() then validates.
 * Framework-free; `fetchImpl` is injected so tests never touch the network.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

type Schema = { [k: string]: unknown };

/** Gemini takes an OpenAPI-style subset: upper-case types and no additionalProperties. */
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (node && typeof node === "object") {
    const out: Schema = {};
    for (const [k, v] of Object.entries(node as Schema)) {
      if (k === "additionalProperties") continue;
      out[k] = k === "type" && typeof v === "string" ? v.toUpperCase() : toGeminiSchema(v);
    }
    return out;
  }
  return node;
}

export function geminiCaller(opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {
  const { apiKey, model = DEFAULT_GEMINI_MODEL, fetchImpl = fetch, timeoutMs = 8000 } = opts;
  return async (prompt: string): Promise<string> => {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // The key goes in a header, never in the URL.
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: toGeminiSchema(MODEL_JSON_SCHEMA), temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const json = (await res.json()) as {
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: { blockReason?: string };
    };
    if (json.promptFeedback?.blockReason) throw new Error(`Gemini blocked: ${json.promptFeedback.blockReason}`);
    const c = json.candidates?.[0];
    if (!c || (c.finishReason && c.finishReason !== "STOP")) throw new Error(`Gemini stopped: ${c?.finishReason ?? "no candidate"}`);
    return (c.content?.parts ?? []).map((p) => p.text ?? "").join("");
  };
}
