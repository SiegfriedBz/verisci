import { FIELD_OUTPUT_SCHEMA, type FieldCheckInput, fieldCheckPrompt } from "@labstrail/core";
import { describe, expect, it, vi } from "vitest";
import { checkField } from "./field-check.ts";

const KEY = "secret-gemini-key";
const PAPER: FieldCheckInput = {
  title: "Observation of gravitational waves from a binary black hole merger",
  abstract: "On September 14, 2015 the two detectors of LIGO observed a transient signal.",
  opening: "Introduction\nIn 1916 Einstein predicted gravitational waves.",
};
const OUTSIDE = { field: "outside", reason: "A physics paper on gravitational waves." };

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function geminiAnswer(text: string, finishReason = "STOP") {
  return {
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }],
    modelVersion: "gemini-3.5-flash-lite-001",
  };
}

function checker(reply: () => Promise<Response>) {
  const fetch = vi.fn(reply);
  const options = { apiKey: KEY, model: "gemini-3.5-flash-lite", fetch, timeoutMs: 60_000 };
  return { fetch, check: () => checkField(PAPER, options) };
}

describe("checkField", () => {
  it("asks Gemini once, with the field prompt, temperature 0 and the output schema", async () => {
    const { fetch, check } = checker(async () => answer(geminiAnswer(JSON.stringify(OUTSIDE))));

    await check();

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(KEY);
    const { system, user } = fieldCheckPrompt(PAPER);
    expect(JSON.parse(String(init.body))).toEqual({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: FIELD_OUTPUT_SCHEMA,
      },
    });
  });

  it.each([
    ["outside", OUTSIDE],
    ["life-sciences", { field: "life-sciences", reason: "A trial of a stroke drug." }],
  ])("returns the field %s, Gemini's reason and the model version", async (_, given) => {
    const { check } = checker(async () => answer(geminiAnswer(JSON.stringify(given))));

    expect(await check()).toEqual({
      ok: true,
      field: given.field,
      reason: given.reason,
      model: "gemini-3.5-flash-lite-001",
    });
  });

  it.each([
    ["HTTP 429", async () => answer({}, 429), { reason: "rate-limited", status: 429 }],
    ["HTTP 503", async () => answer({}, 503), { reason: "unreachable", status: 503 }],
    ["HTTP 403", async () => answer({}, 403), { reason: "refused", status: 403 }],
    [
      "a network error",
      () => Promise.reject(new TypeError("fetch failed")),
      { reason: "unreachable" },
    ],
    [
      "a timeout",
      () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
      { reason: "unreachable" },
    ],
    [
      "an answer that does not parse",
      async () => answer(geminiAnswer(JSON.stringify({ field: "physics", reason: "x" }))),
      { reason: "invalid-output" },
    ],
    [
      "a finish other than STOP",
      async () => answer(geminiAnswer(JSON.stringify(OUTSIDE), "MAX_TOKENS")),
      { reason: "invalid-output" },
    ],
  ])("gives %s as a failure", async (_, reply, failure) => {
    expect(await checker(reply).check()).toEqual({ ok: false, ...failure });
  });

  it("never carries the key or Gemini's text in a failure", async () => {
    for (const reply of [
      async () => answer({ error: { message: `bad key ${KEY}` } }, 400),
      () => Promise.reject(new Error(`failed with ${KEY}`)),
      async () => answer(geminiAnswer(`not JSON ${KEY}`)),
    ]) {
      const result = JSON.stringify(await checker(reply).check());
      expect(result).not.toContain(KEY);
      expect(result).not.toContain("not JSON");
    }
  });
});
