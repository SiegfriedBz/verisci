import { checklistOf, type PaperText, SCORER_OUTPUT_SCHEMA, scorerPrompt } from "@labstrail/core";
import { describe, expect, it, vi } from "vitest";
import { askScorer, scorePaper } from "./scorer.ts";

const KEY = "secret-gemini-key";
const PAPER: PaperText = {
  text: "A case of thyroiditis after vaccination.\nFunding: none.\nThe patient consented.",
  shortened: false,
};
const IN_FIELD = {
  field: "life-sciences",
  studyType: "other",
  reason: "A case report of thyroiditis after a vaccine.",
  rationale: "It states its funding and little else.",
  checks: checklistOf("other").map(({ id }) => ({
    id,
    answer: id === "funding" ? "shown" : "missing",
    quote: id === "funding" ? "Funding: none." : "",
  })),
};
const OUTSIDE = {
  field: "outside",
  studyType: "computational",
  reason: "A machine translation model.",
  checks: [],
  rationale: "",
};

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function geminiAnswer(text: string, extra: Record<string, unknown> = {}) {
  return {
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
    modelVersion: "gemini-3.8-flash-001",
    ...extra,
  };
}

function scorer(reply: () => Promise<Response>) {
  const fetch = vi.fn(reply);
  const options = { apiKey: KEY, model: "gemini-3.8-flash", fetch, timeoutMs: 240_000 };
  return { fetch, score: () => scorePaper(PAPER, options), ask: () => askScorer(PAPER, options) };
}

describe("scorePaper", () => {
  it("asks Gemini once, with the prompt, temperature 0 and the output schema", async () => {
    const { fetch, score } = scorer(async () => answer(geminiAnswer(JSON.stringify(IN_FIELD))));

    await score();

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(KEY);
    const { system, user } = scorerPrompt(PAPER);
    expect(JSON.parse(String(init.body))).toEqual({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: SCORER_OUTPUT_SCHEMA,
      },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("scores a paper in the field with the score code computes, and the model version", async () => {
    const { score } = scorer(async () => answer(geminiAnswer(JSON.stringify(IN_FIELD))));
    const result = await score();

    // `other`: 8 checks, none said not to apply; funding shown: 1 / 8.
    expect(result).toMatchObject({
      ok: true,
      field: "life-sciences",
      model: "gemini-3.8-flash-001",
      output: { score: 13, studyType: "other", rationale: IN_FIELD.rationale },
    });
    expect(
      result.ok &&
        result.field === "life-sciences" &&
        result.output.checks.find((check) => check.id === "funding"),
    ).toEqual({ id: "funding", answer: "shown", quote: "Funding: none." });
  });

  it("gives a paper outside the field with Gemini's reason, and no score", async () => {
    const { score } = scorer(async () => answer(geminiAnswer(JSON.stringify(OUTSIDE))));

    expect(await score()).toEqual({
      ok: true,
      field: "outside",
      reason: "A machine translation model.",
      model: "gemini-3.8-flash-001",
    });
  });

  it("names the model asked for when Gemini reports none", async () => {
    const { score } = scorer(async () =>
      answer({ ...geminiAnswer(JSON.stringify(OUTSIDE)), modelVersion: undefined }),
    );

    expect(await score()).toMatchObject({ ok: true, model: "gemini-3.8-flash" });
  });

  it("reads the answer's text across its parts, leaving out thoughts", async () => {
    const text = JSON.stringify(OUTSIDE);
    const { score } = scorer(async () =>
      answer({
        candidates: [
          {
            content: {
              parts: [
                { text: "thinking…", thought: true },
                { text: text.slice(0, 20) },
                { text: text.slice(20) },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );

    expect(await score()).toMatchObject({ ok: true, field: "outside" });
  });

  it.each([
    ["429", 429, "rate-limited"],
    ["500", 500, "unreachable"],
    ["503", 503, "unreachable"],
  ])("gives HTTP %s as %s, with its status", async (_, status, reason) => {
    const { score } = scorer(async () => answer({ error: { code: status } }, status));

    expect(await score()).toEqual({ ok: false, reason, status });
  });

  it.each([
    ["a network error", () => Promise.reject(new TypeError("fetch failed")), "unreachable"],
    [
      "a timeout",
      () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
      "unreachable",
    ],
    [
      "no candidate",
      async () => answer({ promptFeedback: { blockReason: "SAFETY" } }),
      "invalid-output",
    ],
    [
      "an answer stopped for safety",
      async () =>
        answer({ candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "SAFETY" }] }),
      "invalid-output",
    ],
    [
      "an answer the check refuses",
      async () =>
        answer(geminiAnswer(JSON.stringify({ ...IN_FIELD, checks: IN_FIELD.checks.slice(1) }))),
      "invalid-output",
    ],
    [
      "a body that is not JSON",
      async () => new Response("<html>", { status: 200 }),
      "invalid-output",
    ],
  ])("gives %s as %s", async (_, reply, reason) => {
    expect(await scorer(reply).score()).toEqual({ ok: false, reason });
  });

  it.each([
    ["400, Gemini's answer to a bad key", 400],
    ["401", 401],
    ["403", 403],
    ["404, a model Gemini no longer serves", 404],
    ["413", 413],
  ])("answers refused with the status for %s", async (_, status) => {
    expect(await scorer(async () => answer({}, status)).score()).toEqual({
      ok: false,
      reason: "refused",
      status,
    });
  });

  it("never carries the key in a result", async () => {
    for (const reply of [
      async () => answer({ error: { message: `bad key ${KEY}` } }, 400),
      () => Promise.reject(new Error(`failed with ${KEY}`)),
    ]) {
      expect(JSON.stringify(await scorer(reply).score())).not.toContain(KEY);
    }
  });
});

describe("askScorer", () => {
  it("gives Gemini's answer before its quotes are checked against the paper", async () => {
    const made = {
      ...IN_FIELD,
      checks: IN_FIELD.checks.map((check) =>
        check.id === "conflicts"
          ? { ...check, answer: "shown", quote: "No competing interests." }
          : check,
      ),
    };
    const { ask, score } = scorer(async () => answer(geminiAnswer(JSON.stringify(made))));

    const asked = await ask();
    const scored = await score();

    expect(asked.ok && asked.answer.checks.find((check) => check.id === "conflicts")).toEqual({
      id: "conflicts",
      answer: "shown",
      quote: "No competing interests.",
    });
    expect(
      scored.ok &&
        scored.field === "life-sciences" &&
        scored.output.checks.find((check) => check.id === "conflicts"),
    ).toEqual({
      id: "conflicts",
      answer: "missing",
      claimed: { answer: "shown", quote: "No competing interests." },
    });
  });
});
