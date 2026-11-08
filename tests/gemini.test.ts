import { describe, expect, it } from "vitest";
import { geminiCaller, toGeminiSchema } from "@/lib/ai/gemini";
import { breakdown, BreakdownRequest, MODEL_JSON_SCHEMA } from "@/lib/ai/breakdown";

const good = JSON.stringify({
  subtasks: [
    { title: "Research", description: "", estimateHours: 1, order: 1 },
    { title: "Draft", description: "", estimateHours: 2, order: 2 },
    { title: "Edit", description: "", estimateHours: 1, order: 3 },
  ],
  assumptions: [],
});
const ok = (text: string) => async () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }] }), { status: 200 });

describe("gemini provider", () => {
  it("sends a Gemini-shaped schema and keeps the key out of the URL", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const call = geminiCaller({ apiKey: "k", fetchImpl: (async (url: string, init: RequestInit) => { seen = { url, init }; return ok(good)(); }) as unknown as typeof fetch });
    expect(await call("hello")).toBe(good);
    expect(seen!.url).not.toContain("k=");
    expect((seen!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    const body = JSON.parse(seen!.init.body as string);
    expect(body.generationConfig.responseSchema.type).toBe("OBJECT");
    expect(JSON.stringify(body.generationConfig.responseSchema)).not.toContain("additionalProperties");
    expect(JSON.stringify(toGeminiSchema(MODEL_JSON_SCHEMA))).toContain('"INTEGER"');
  });

  it("feeds the normal breakdown pipeline, and failures fall back to the template", async () => {
    const req = BreakdownRequest.parse({ title: "Essay", type: "assignment", estimateHours: 4 });
    const live = geminiCaller({ apiKey: "k", fetchImpl: ok(good) as unknown as typeof fetch });
    expect((await breakdown(req, { callModel: () => live("p") })).source).toBe("ai");
    const down = geminiCaller({ apiKey: "k", fetchImpl: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch });
    expect((await breakdown(req, { callModel: () => down("p") })).source).toBe("template");
  });

  it("treats a blocked or truncated answer as a failure", async () => {
    const f = (async () => new Response(JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(geminiCaller({ apiKey: "k", fetchImpl: f })("p")).rejects.toThrow(/stopped/);
  });
});
