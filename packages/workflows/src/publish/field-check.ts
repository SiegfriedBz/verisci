import {
  FIELD_OUTPUT_SCHEMA,
  type Field,
  type FieldCheckInput,
  fieldCheckPrompt,
  parseFieldAnswer,
} from "@labstrail/core";
import { type GeminiFailureResult, type GeminiOptions, generate } from "../gemini/gemini.ts";

/** The result of {@link checkField}: the paper's field and Gemini's reason, or why not. */
export type FieldCheckResult =
  | { readonly ok: true; readonly field: Field; readonly reason: string; readonly model: string }
  | GeminiFailureResult;

/**
 * Asks Gemini whether a paper is in LabsTrail's field (ADR 0037), from its title, abstract and
 * opening, for the publish run before it stores a new paper and for the rating run before it
 * scores one: the prompt from `fieldCheckPrompt`, temperature 0, JSON output held to
 * `FIELD_OUTPUT_SCHEMA` and checked again with `parseFieldAnswer`. Returns the field, Gemini's
 * reason and the model version Gemini reports. Never throws; a failure carries neither the key
 * nor Gemini's text.
 */
export async function checkField(
  paper: FieldCheckInput,
  options: GeminiOptions,
): Promise<FieldCheckResult> {
  const answer = await generate(fieldCheckPrompt(paper), FIELD_OUTPUT_SCHEMA, options);
  if (!answer.ok) return answer;
  const parsed = parseFieldAnswer(answer.text);
  return parsed.ok
    ? { ok: true, field: parsed.field, reason: parsed.reason, model: answer.model }
    : { ok: false, reason: "invalid-output" };
}
