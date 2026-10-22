import {
  type PaperText,
  parseScorerAnswer,
  SCORER_OUTPUT_SCHEMA,
  type ScorerAnswer,
  type ScorerOutput,
  scoreChecks,
  scorerPrompt,
} from "@labstrail/core";
import { type GeminiFailureResult, type GeminiOptions, generate } from "../gemini/gemini.ts";

/** The result of {@link askScorer}: Gemini's answer, checked, its quotes not yet checked. */
export type AskResult =
  | { readonly ok: true; readonly answer: ScorerAnswer; readonly model: string }
  | GeminiFailureResult;

/**
 * The result of {@link scorePaper}: a paper in the field with its score, as `scoreChecks`
 * computed it, or a paper outside the field (ADR 0037) with the reason Gemini gave.
 */
export type ScoreResult =
  | {
      readonly ok: true;
      readonly field: "life-sciences";
      readonly output: ScorerOutput;
      readonly model: string;
    }
  | {
      readonly ok: true;
      readonly field: "outside";
      readonly reason: string;
      readonly model: string;
    }
  | GeminiFailureResult;

/**
 * Asks Gemini, in one request, for a paper's field and kind of study and, for a paper in the
 * field, the answer to each check of its study type, with quotes (ADRs 0018, 0037): the prompt
 * from `scorerPrompt`, temperature 0, JSON output held to `SCORER_OUTPUT_SCHEMA` (the shared
 * `generate` call) and checked again with `parseScorerAnswer`. Returns the answer, its quotes
 * not yet checked against the paper, and the model version Gemini reports. Never throws; a
 * failure carries neither the key nor Gemini's text.
 */
export async function askScorer(paper: PaperText, options: GeminiOptions): Promise<AskResult> {
  const answer = await generate(scorerPrompt(paper), SCORER_OUTPUT_SCHEMA, options);
  if (!answer.ok) return answer;
  const parsed = parseScorerAnswer(answer.text);
  return parsed.ok
    ? { ok: true, answer: parsed.answer, model: answer.model }
    : { ok: false, reason: "invalid-output" };
}

/**
 * Scores a paper with one Gemini request ({@link askScorer}): a paper outside the field comes
 * back with Gemini's reason; one in the field is scored by `scoreChecks`, which checks each
 * quote against the paper and computes the score, so nothing else reaches the chain.
 * Never throws.
 */
export async function scorePaper(paper: PaperText, options: GeminiOptions): Promise<ScoreResult> {
  const asked = await askScorer(paper, options);
  if (!asked.ok) return asked;
  const { answer, model } = asked;
  return answer.field === "outside"
    ? { ok: true, field: "outside", reason: answer.reason, model }
    : { ok: true, field: "life-sciences", output: scoreChecks(paper, answer), model };
}
