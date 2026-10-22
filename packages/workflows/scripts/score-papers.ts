// Dev only: scores the reference papers (reference-papers.json) as a rating run would, reading
// each PDF's text and asking Gemini for its field, study type and checks in one request, and
// prints how each compares with what is expected. It never publishes, stores or rates anything.
// With --field, it runs only the publish run's field check instead: GROBID's header and the
// text's opening, then one Flash-Lite request per paper.
//
//   pnpm --filter @labstrail/workflows score-papers [--field] [id…]
//
// Reads GEMINI_API_KEY (and GROBID_URL with --field, with DKG_TOKEN as GROBID's credential on
// the node server) from the root .env.local (packages/workflows README). Downloads each PDF
// once into node_modules/.cache/labstrail-reference/, and writes each run's answers there too,
// after each paper, so a run that stops keeps the answers it paid for.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import {
  type CheckResult,
  type PaperText,
  type ScorerAnswer,
  type ScorerOutput,
  scoreChecks,
} from "@labstrail/core";
import { createSharedEnv, defineEnv } from "@labstrail/env";
import { z } from "zod";
import type { GeminiFailureResult } from "../src/gemini/gemini.ts";
import { paperTextOf } from "../src/pdf/paper-text.ts";
import { checkField } from "../src/publish/field-check.ts";
import { PUBLISH_SETTINGS } from "../src/publish/publish-paper.ts";
import { readPaper } from "../src/publish/read-paper.ts";
import { RATING_SETTINGS } from "../src/rating/rate-paper.ts";
import { askScorer } from "../src/rating/scorer.ts";
import { geminiSchema } from "../src/workflows-env.ts";
import { type ReferencePaper, readReferencePapers } from "./reference-papers.ts";

const CACHE = new URL("../node_modules/.cache/labstrail-reference/", import.meta.url);
/**
 * Gemini's free tier answers a burst with 429s: wait between calls, and retry a few times. An
 * answer the check refuses is asked for again only as often as a rating run does.
 */
const PAUSE_MS = 5_000;
const RETRY_WAIT_MS = 30_000;
const TRIES = 3;

const shared = createSharedEnv();
if (shared.APP_ENV !== "local") {
  console.error("score-papers runs only with APP_ENV=local");
  process.exit(1);
}
const args = process.argv.slice(2);
const fieldOnly = args.includes("--field");
const env = defineEnv({
  extends: [shared],
  server: {
    ...geminiSchema,
    GROBID_URL: fieldOnly ? z.url() : z.string().optional(),
    DKG_TOKEN: z.string().optional(),
  },
  runtimeEnv: process.env,
});
const gemini = {
  apiKey: env.GEMINI_API_KEY,
  model: RATING_SETTINGS.model,
  fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
};

const all = readReferencePapers(
  JSON.parse(await readFile(new URL("./reference-papers.json", import.meta.url), "utf8")),
);
const wanted = args.filter((arg) => arg !== "--field");
const unknown = wanted.filter((id) => !all.some((paper) => paper.id === id));
if (unknown.length > 0) {
  console.error(`Not in reference-papers.json: ${unknown.join(", ")}`);
  process.exit(1);
}
const papers = wanted.length > 0 ? all.filter((paper) => wanted.includes(paper.id)) : all;
await mkdir(CACHE, { recursive: true });

/** What the scorer gave for one paper: its classification, Gemini's answers and the score. */
interface Found {
  readonly id: string;
  readonly expected: string;
  readonly found?: string;
  readonly range?: readonly [number, number];
  /** Gemini's answer before its quotes were checked against the paper. */
  readonly asked?: ScorerAnswer;
  /** How long Gemini took, retries and pauses included, in seconds. */
  readonly seconds?: number;
  readonly output?: ScorerOutput;
  readonly failure?: string;
}

const file = new URL(
  `${fieldOnly ? "field" : "results"}-${new Date().toISOString().replaceAll(":", "-")}.json`,
  CACHE,
);
if (fieldOnly) {
  await checkFields(papers);
  process.exit(0);
}
const results: Found[] = [];
for (const paper of papers) {
  const result = await score(paper).catch(
    (error: unknown): Found => ({ ...baseOf(paper), failure: `stopped: ${String(error)}` }),
  );
  results.push(result);
  report(paper, result);
  await writeFile(file, `${JSON.stringify(results, null, 2)}\n`);
}
summarize(results);
console.log(`\nAnswers written to ${file.pathname}`);

function baseOf(paper: ReferencePaper) {
  return {
    id: paper.id,
    expected: paper.field === "outside" ? "outside" : paper.studyType,
    ...(paper.expectedScore ? { range: paper.expectedScore } : {}),
  };
}

async function score(paper: ReferencePaper): Promise<Found> {
  const base = baseOf(paper);
  const text = await paperText(paper);
  if (!text.ok) return { ...base, failure: text.failure };

  const started = Date.now();
  const asked = await withRetries(() =>
    askScorer(text.paper, { ...gemini, timeoutMs: RATING_SETTINGS.scorerTimeoutMs }),
  );
  const seconds = Math.round((Date.now() - started) / 1000);
  if (!asked.ok) return { ...base, seconds, failure: `scorer ${describe(asked)}` };
  const { answer } = asked;
  if (answer.field === "outside") return { ...base, found: "outside", seconds, asked: answer };
  const output = scoreChecks(text.paper, answer);
  return { ...base, found: answer.studyType, seconds, asked: answer, output };
}

/** What the field check gave for one paper. */
interface FieldFound {
  readonly id: string;
  readonly expected: "life-sciences" | "outside";
  readonly found?: string;
  readonly reason?: string;
  readonly failure?: string;
}

/**
 * Runs the publish run's field check on each paper, reading it as the publish run does
 * (`readPaper`: GROBID's header and the opening of the text) from the cached PDF, then
 * `checkField`, and prints the expected and the found field.
 */
async function checkFields(list: readonly ReferencePaper[]): Promise<void> {
  const found: FieldFound[] = [];
  for (const paper of list) {
    const result = await checkOne(paper).catch(
      (error: unknown): FieldFound => ({
        id: paper.id,
        expected: paper.field,
        failure: `stopped: ${String(error)}`,
      }),
    );
    found.push(result);
    const verdict = result.failure
      ? `FAILED: ${result.failure}`
      : result.found === result.expected
        ? "right"
        : "WRONG";
    console.log(
      `\n${paper.id}\n  expected ${result.expected} · found ${result.found ?? "-"} · ${verdict}`,
    );
    if (result.reason) console.log(`  ${result.reason}`);
    await writeFile(file, `${JSON.stringify(found, null, 2)}\n`);
  }
  const right = found.filter((result) => result.found === result.expected).length;
  console.log(`\nSummary\n  field right: ${right} of ${found.length}`);
  console.log(`\nAnswers written to ${file.pathname}`);
}

async function checkOne(paper: ReferencePaper): Promise<FieldFound> {
  const base = { id: paper.id, expected: paper.field };
  const bytes = await pdfBytes(paper);
  if (typeof bytes === "string") return { ...base, failure: bytes };
  // readPaper fetches by CID from the gateway: the cached PDF stands in for it.
  const gatewayUrl = "https://cache.invalid";
  const read = await readPaper("cached", {
    gatewayUrl,
    grobidUrl: String(env.GROBID_URL),
    token: env.DKG_TOKEN,
    fetch: async (input: string | URL | Request, init?: RequestInit) =>
      String(input).startsWith(gatewayUrl)
        ? new Response(bytes.slice() as Uint8Array<ArrayBuffer>)
        : fetch(input, init),
    maxBytes: PUBLISH_SETTINGS.maxPdfBytes,
    timeoutMs: 120_000,
    openingChars: PUBLISH_SETTINGS.openingChars,
  });
  if (!read.ok) return { ...base, failure: `read ${read.reason}` };
  const { title, abstract } = read.metadata;
  const checked = await withRetries(() =>
    checkField(
      { title, ...(abstract ? { abstract } : {}), opening: read.opening },
      { ...gemini, model: PUBLISH_SETTINGS.fieldModel, timeoutMs: PUBLISH_SETTINGS.fieldTimeoutMs },
    ),
  );
  if (!checked.ok) return { ...base, failure: `field check ${describe(checked)}` };
  return { ...base, found: checked.field, reason: checked.reason };
}

/** The paper's text, as a rating run prepares it, from its PDF in the cache ({@link pdfBytes}). */
async function paperText(
  paper: ReferencePaper,
): Promise<{ ok: true; paper: PaperText } | { ok: false; failure: string }> {
  const bytes = await pdfBytes(paper);
  if (typeof bytes === "string") return { ok: false, failure: bytes };
  const text = await paperTextOf(bytes, RATING_SETTINGS.maxTextChars);
  if (text.ok) return text;
  return { ok: false, failure: text.reason === "no-text" ? "the PDF has no text" : "unreadable" };
}

/**
 * The paper's PDF, downloaded once into the cache, or why not. A file that is not a PDF, such as
 * the page a publisher shows a robot, is never cached: save the PDF there by hand.
 */
async function pdfBytes(paper: ReferencePaper): Promise<Uint8Array | string> {
  const path = new URL(`${paper.id}.pdf`, CACHE);
  const cached = await readFile(path).then(
    (file) => new Uint8Array(file),
    () => undefined,
  );
  const bytes = cached ?? (await download(paper.url));
  if (typeof bytes === "string") return bytes;
  if (!isPdf(bytes)) return `not a PDF (a robot check?): save the PDF as ${path.pathname}`;
  // unpdf takes the bytes over, so they are written to the cache before anything reads them.
  if (!cached) await writeFile(path, bytes);
  return bytes;
}

/** The file at `url`, or why it did not come. */
async function download(url: string): Promise<Uint8Array | string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) return `download failed (HTTP ${response.status})`;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return "download failed (no answer)";
  }
}

function isPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}

/** Calls Gemini, retrying a rate limit or an outage, and an answer the check refuses once. */
async function withRetries<T extends { ok: true } | GeminiFailureResult>(call: () => Promise<T>) {
  let unusable = 0;
  for (let attempt = 1; ; attempt++) {
    await sleep(PAUSE_MS);
    const result = await call();
    if (result.ok || result.reason === "refused" || attempt === TRIES) return result;
    if (result.reason === "invalid-output") unusable += 1;
    if (unusable === RATING_SETTINGS.unusableAnswers) return result;
    console.error(`  Gemini: ${result.reason}, trying again in ${RETRY_WAIT_MS / 1000} s`);
    await sleep(RETRY_WAIT_MS);
  }
}

function describe(failure: GeminiFailureResult): string {
  return failure.status === undefined
    ? failure.reason
    : `${failure.reason} (HTTP ${failure.status})`;
}

/**
 * One paper's line, then each check scored otherwise than expected or that lost Gemini's
 * answer, with why. Checks are compared only when the study type is the expected one.
 */
function report(paper: ReferencePaper, result: Found): void {
  const type =
    result.found === result.expected
      ? result.expected
      : `${result.expected} → ${result.found ?? "?"}`;
  const range = result.range ? `${result.range[0]}–${result.range[1]}` : "outside";
  const score = result.output?.score ?? "-";
  const took = result.seconds === undefined ? "" : ` · ${result.seconds} s`;
  console.log(
    `\n${paper.id}\n  type ${type} · expected ${range} · score ${score} · ${verdict(result)}${took}`,
  );
  if (!paper.expectedChecks || !result.output) return;
  if (result.found !== result.expected) {
    console.log("  checks not compared: another study type");
    return;
  }
  for (const check of result.output.checks) {
    const expected = paper.expectedChecks[check.id] ?? "?";
    if (expected === check.answer && !check.claimed) continue;
    console.log(`  ${check.id}: expected ${expected}, scored ${check.answer}${note(check)}`);
  }
}

/** The quote behind a check's answer, or why Gemini's answer did not count. */
function note(check: CheckResult): string {
  const { claimed } = check;
  if (!claimed) return check.quote ? ` ("${clip(check.quote)}")` : "";
  if (claimed.answer === "not-applicable")
    return " (Gemini said not-applicable; it always applies)";
  return claimed.quote
    ? ` (Gemini said ${claimed.answer}; quote not in the paper: "${clip(claimed.quote)}")`
    : ` (Gemini said ${claimed.answer}, with no quote)`;
}

function verdict(result: Found): string {
  if (result.failure) return `FAILED: ${result.failure}`;
  if (result.expected === "outside") {
    return result.found === "outside" ? "right" : "WRONG: scored in the field";
  }
  if (result.found === "outside") return "WRONG: classed outside";
  return inRange(result) ? "in range" : "OUT OF RANGE";
}

function clip(text: string): string {
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

function inRange(result: Found): boolean {
  const { range, output } = result;
  return Boolean(range && output && output.score >= range[0] && output.score <= range[1]);
}

function summarize(found: readonly Found[]): void {
  const inField = found.filter((result) => result.expected !== "outside");
  const outside = found.filter((result) => result.expected === "outside");
  const count = (list: readonly Found[], test: (result: Found) => boolean) =>
    list.filter(test).length;
  console.log("\nSummary");
  console.log(
    `  outside the field, classified outside: ${count(outside, (r) => r.found === "outside")} of ${outside.length}`,
  );
  console.log(
    `  study type right: ${count(inField, (r) => r.found === r.expected)} of ${inField.length}`,
  );
  console.log(`  score in its range: ${count(inField, inRange)} of ${inField.length}`);
  const failed = found.filter((result) => result.failure);
  if (failed.length > 0) console.log(`  failed: ${failed.map((r) => r.id).join(", ")}`);
}
