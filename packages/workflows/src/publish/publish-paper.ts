import {
  type FieldCheckInput,
  MAX_PDF_BYTES,
  type PaperMetadata,
  type Triple,
  targetKaName,
  targetKaQuads,
} from "@labstrail/core";
import type { DkgClient, DkgFailure } from "@labstrail/dkg";
import { type Inngest, NonRetriableError } from "inngest";
import { publishedNotice } from "../alerts/messages.ts";
import type { Notify } from "../alerts/notify.ts";
import type { FieldCheckResult } from "./field-check.ts";
import type { SubmissionRefusal, VerifiedSubmission, VerifyResult } from "./verify-submission.ts";

/** The event that starts a publish: `{ cid, contextGraph, deadline, submitter, signature }`. */
export const PAPER_SUBMITTED = "labstrail/paper.submitted";

/** The publish run's limits and its field check's settings (ADR 0008, ADR 0009, ADR 0037). */
export const PUBLISH_SETTINGS = {
  /** Largest PDF read from the gateway. */
  maxPdfBytes: MAX_PDF_BYTES,
  /** How long `startMint` listens for the node's answer. */
  listenMs: 10_000,
  pollInterval: "30s",
  /** Polls before a mint is started again: 10 minutes at 30 s. */
  pollsPerMint: 20,
  retryWait: "2m",
  attempts: 5,
  /**
   * A run's whole budget, enforced by Inngest. The field check adds at most about 2.5 minutes
   * once per run (two calls of `fieldTimeoutMs` and `fieldRetryWait`).
   */
  finishTimeout: "45m",
  /** The Gemini model that checks a new paper's field, on the free tier (ADR 0037). */
  fieldModel: "gemini-3.5-flash-lite",
  /** How long Gemini gets to check a paper's field, inside a step's 300 s on Vercel. */
  fieldTimeoutMs: 60_000,
  /**
   * The wait before the field check is asked once more: shorter than `retryWait` (ADR 0009),
   * since free-tier Gemini calls that failed within seconds answered when asked again 30 s later
   * (`docs/domain.md` → Gemini), and a paper is published anyway when the second ask fails, so a
   * longer wait would only hold it back.
   */
  fieldRetryWait: "30s",
  /** The longest opening of a paper's text the field check reads, as the rating prepares it. */
  openingChars: 6_000,
} as const;

/**
 * Why a paper cannot be published; a retry would not change it. `unreadable` and `no-text` are
 * PDFs the rating's reader cannot read; `outside-field`, a paper the field check placed
 * outside LabsTrail's field (ADR 0037).
 */
export type PaperRefusal =
  | "not-a-pdf"
  | "too-large"
  | "unparseable"
  | "no-title"
  | "unreadable"
  | "no-text"
  | "outside-field";

/**
 * The result of reading a paper: its metadata and the opening of its text, or why not
 * (`unreachable` is worth a retry; `unauthorized`, GROBID refusing our credential, is a setup
 * error).
 */
export type ReadPaperResult =
  | { readonly ok: true; readonly metadata: PaperMetadata; readonly opening: string }
  | {
      readonly ok: false;
      readonly reason: Exclude<PaperRefusal, "outside-field"> | "unreachable" | "unauthorized";
    };

/**
 * Why a publish run stopped without an outcome, carried in its error as
 * `publish-failed:<reason>: <detail>` so the paper's page can say it
 * ({@link publishFailureReason}). `network-refused` is the network's cores declining the mint
 * (the node's `retry-later`, such as a graph waiting for the cores' activation,
 * `docs/domain.md` → DKG). All but `setup` are worth publishing the same PDF again later;
 * `setup` is ours to fix.
 */
export type PublishFailure =
  | "chain-unreachable"
  | "paper-unreachable"
  | "node-unreachable"
  | "network-refused"
  | "mint-not-confirmed"
  | "setup";

const PUBLISH_FAILURES: readonly PublishFailure[] = [
  "chain-unreachable",
  "paper-unreachable",
  "node-unreachable",
  "network-refused",
  "mint-not-confirmed",
  "setup",
];

/** The error that stops a run, with its reason first in the message. */
function stop(reason: PublishFailure, detail: string, cause?: unknown): NonRetriableError {
  return new NonRetriableError(`publish-failed:${reason}: ${detail}`, { cause });
}

/**
 * The reason a failed run's error carries, wherever Inngest nests the error in the run's
 * output (an object, or the JSON text the dev server gives), or `undefined`.
 */
export function publishFailureReason(output: unknown): PublishFailure | undefined {
  const text = typeof output === "string" ? output : JSON.stringify(output ?? null);
  const found = /publish-failed:([a-z-]+): /.exec(text)?.[1];
  return PUBLISH_FAILURES.find((reason) => reason === found);
}

/** How a publish run ends, unless it fails. */
export type PublishOutcome =
  | { readonly state: "minted"; readonly ual: string }
  | { readonly state: "refused"; readonly reason: SubmissionRefusal | PaperRefusal };

/** The step tools a publish run uses: Inngest's `step.run` and `step.sleep`. */
export interface PublishSteps {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
  sleep(id: string, duration: string): Promise<void>;
}

/**
 * Where a publish run logs the field check's verdicts (Inngest's logger), and where a
 * submission or an upload URL names a service that gave no answer (the server's console).
 */
export interface PublishLogger {
  info(message: string): void;
  warn(message: string): void;
}

/** The adapters a publish run calls. */
export interface PublishDeps {
  /** Checks the event data, its deadline against `receivedAt` (ms), when Inngest received it. */
  verifySubmission(data: unknown, receivedAt: number): Promise<VerifyResult>;
  /**
   * Fetches the PDF, parses its header and reads the opening of its text, in one step so its
   * bytes are never a step output.
   */
  readPaper(cid: string): Promise<ReadPaperResult>;
  /** Asks Gemini whether a new paper is in LabsTrail's field (ADR 0037). */
  checkField(paper: FieldCheckInput): Promise<FieldCheckResult>;
  readonly dkg: Pick<DkgClient, "readAsset" | "storeAsset" | "startMint">;
  /** Tells the maintainer's Telegram chat (ADR 0038); never throws. */
  notify: Notify;
  /** The site's address, for the message's link to the paper's page (`siteUrlOf`). */
  readonly siteUrl: string | undefined;
}

type Attempt =
  | { readonly kind: "done"; readonly outcome: PublishOutcome }
  | { readonly kind: "retry"; readonly reason: string; readonly failure: PublishFailure }
  | { readonly kind: "mint-again" }
  | { readonly kind: "fatal"; readonly reason: string };

/**
 * Publishes a paper as a Target KA (ADR 0010): checks the submission, then reads the KA's
 * state and does only what is left (ADR 0007): read the paper, check its field, store, mint,
 * poll. A KA already stored or minted keeps its first submitter.
 *
 * A new paper's field is checked once per run, after its first read (ADR 0037): a paper
 * outside the field ends the run `refused: outside-field` before anything is stored. A check
 * that fails waits `fieldRetryWait` and is asked once more; when that fails too, the paper is
 * published, its rating checking the field again, and the run logs `field-unchecked`. Gemini
 * refusing the request (a bad key, a model it no longer serves) is ours to fix, not a missing
 * answer: it fails the run (`setup`) with nothing stored. A draft or a minted asset is never
 * checked: its content is sealed.
 *
 * A failure worth a retry waits `retryWait` with `step.sleep` and starts again from the
 * read, for `attempts` attempts (ADR 0009); a mint not seen after `pollsPerMint` polls is
 * started again (ADR 0008). Throws `NonRetriableError` when the node or GROBID refuses our
 * credential, Gemini refuses the field check's request, the node does not serve the graph, or
 * the attempts run out.
 *
 * A paper this run minted, and not an earlier one, is announced once (`notify`, ADR 0038), by its
 * title when this run read it, else by its CID.
 *
 * The deadline is checked against `receivedAt`, so retries during an outage never expire a
 * signature that was valid when it arrived. `receivedAt` is the event's `ts`, which its
 * sender may set: only LabsTrail's own server and scripts send this event, and the server
 * must never take `ts` from a browser.
 */
export async function runPublish(
  data: unknown,
  step: PublishSteps,
  deps: PublishDeps,
  receivedAt: number,
  logger: PublishLogger,
): Promise<PublishOutcome> {
  const verified = await verify(data, step, deps, receivedAt);
  if (!verified.ok) return { state: "refused", reason: verified.reason };
  const { submission } = verified;
  const name = targetKaName(submission.cid);
  if (!name.ok) return { state: "refused", reason: "bad-cid" };

  let last = "";
  let lastFailure: PublishFailure = "node-unreachable";
  const field: FieldState = { checked: false };
  const news: News = { minting: false };
  for (let attempt = 1; attempt <= PUBLISH_SETTINGS.attempts; attempt++) {
    const context = { attempt, name: name.name, submission, step, deps, logger, field, news };
    const result = await publishOnce(context);
    if (result.kind === "done") {
      if (result.outcome.state === "minted" && news.minting) {
        const notice = publishedNotice({ cid: submission.cid, title: news.title }, deps.siteUrl);
        await step.run("notify", () => deps.notify(notice));
      }
      return result.outcome;
    }
    if (result.kind === "fatal") throw stop("setup", `publish of ${name.name}: ${result.reason}`);
    last = result.kind === "retry" ? result.reason : "mint not seen";
    lastFailure = result.kind === "retry" ? result.failure : "mint-not-confirmed";
    if (result.kind === "retry" && attempt < PUBLISH_SETTINGS.attempts) {
      await step.sleep(`retry-${attempt}`, PUBLISH_SETTINGS.retryWait);
    }
  }
  throw stop(
    lastFailure,
    `publish of ${name.name} gave up after ${PUBLISH_SETTINGS.attempts} attempts: ${last}`,
  );
}

async function verify(
  data: unknown,
  step: PublishSteps,
  deps: PublishDeps,
  receivedAt: number,
): Promise<
  { ok: true; submission: VerifiedSubmission } | { ok: false; reason: SubmissionRefusal }
> {
  for (let attempt = 1; ; attempt++) {
    const result = await step.run(attempt === 1 ? "verify" : `verify-${attempt}`, () =>
      deps.verifySubmission(data, receivedAt),
    );
    if (result.ok || result.reason !== "unreachable") return result as never;
    if (attempt === PUBLISH_SETTINGS.attempts) {
      throw stop(
        "chain-unreachable",
        `submission of ${String((data as { cid?: unknown })?.cid)}: chain unreachable`,
      );
    }
    await step.sleep(`verify-retry-${attempt}`, PUBLISH_SETTINGS.retryWait);
  }
}

/** Whether the run has had the field check's verdict, or its fallback. */
interface FieldState {
  checked: boolean;
}

/** What the run's message says: whether this run started the mint, and the title it read. */
interface News {
  minting: boolean;
  title?: string;
}

interface AttemptContext {
  readonly attempt: number;
  readonly name: string;
  readonly submission: VerifiedSubmission;
  readonly step: PublishSteps;
  readonly deps: PublishDeps;
  readonly logger: PublishLogger;
  readonly field: FieldState;
  readonly news: News;
}

async function publishOnce(context: AttemptContext): Promise<Attempt> {
  const { attempt, name, submission, step, deps } = context;
  const read = await step.run(`read-${attempt}`, () => deps.dkg.readAsset(name));
  if (!read.ok) return failed(read);
  if (read.state === "minted") return minted(read.ual);

  if (read.state === "missing" || read.state === "draft") {
    // A draft is sealed with its content: storing it only shares it, so its paper is not read again.
    let quads: Triple[] = [];
    if (read.state === "missing") {
      // `parse-paper` replaced `read-paper` when the result gained the text's opening, so a run
      // already going never reads an old result as a new one.
      const paper = await step.run(`parse-paper-${attempt}`, () => deps.readPaper(submission.cid));
      if (!paper.ok) {
        if (paper.reason === "unreachable")
          return { kind: "retry", reason: "paper unreachable", failure: "paper-unreachable" };
        if (paper.reason === "unauthorized")
          return { kind: "fatal", reason: "GROBID unauthorized" };
        return { kind: "done", outcome: { state: "refused", reason: paper.reason } };
      }
      context.news.title = paper.metadata.title;
      if (!context.field.checked) {
        const { title, abstract } = paper.metadata;
        const input = { title, ...(abstract ? { abstract } : {}), opening: paper.opening };
        const verdict = await checkFieldOnce(context, input);
        if (typeof verdict === "object") return verdict;
        context.field.checked = true;
        if (verdict === "outside")
          return { kind: "done", outcome: { state: "refused", reason: "outside-field" } };
      }
      quads = targetKaQuads(paper.metadata, {
        ...submission,
        deadline: BigInt(submission.deadline),
      });
    }
    const stored = await step.run(`store-${attempt}`, () => deps.dkg.storeAsset(name, quads));
    if (!stored.ok) return failed(stored);
    if (stored.state === "minted") return minted(stored.ual);
  }

  const mint = await step.run(`mint-${attempt}`, () =>
    deps.dkg.startMint(name, { listenMs: PUBLISH_SETTINGS.listenMs }),
  );
  if (!mint.ok) return failed(mint);
  context.news.minting = true;
  if (mint.state === "minted") return minted(mint.ual);

  for (let poll = 1; poll <= PUBLISH_SETTINGS.pollsPerMint; poll++) {
    await step.sleep(`wait-${attempt}-${poll}`, PUBLISH_SETTINGS.pollInterval);
    const state = await step.run(`poll-${attempt}-${poll}`, () => deps.dkg.readAsset(name));
    if (!state.ok) return failed(state);
    if (state.state === "minted") return minted(state.ual);
  }
  return { kind: "mint-again" };
}

/**
 * Asks the field check, and once more after `fieldRetryWait` if it fails: `outside` for a paper
 * outside the field, `publish` for one in it or when both asks fail, and a `fatal` attempt when
 * Gemini refuses the request. Logs Gemini's reason for a paper outside, and `field-unchecked`
 * when both asks fail.
 */
async function checkFieldOnce(
  context: AttemptContext,
  paper: FieldCheckInput,
): Promise<"outside" | "publish" | Attempt> {
  const { attempt, submission, step, deps, logger } = context;
  let checked = await step.run(`check-field-${attempt}`, () => deps.checkField(paper));
  if (!checked.ok && checked.reason !== "refused") {
    await step.sleep(`check-field-wait-${attempt}`, PUBLISH_SETTINGS.fieldRetryWait);
    checked = await step.run(`check-field-${attempt}-again`, () => deps.checkField(paper));
  }
  if (!checked.ok) {
    const status = checked.status === undefined ? "" : ` (HTTP ${checked.status})`;
    if (checked.reason === "refused") {
      return {
        kind: "fatal",
        reason: `Gemini refused the field check${status}: check GEMINI_API_KEY and the model`,
      };
    }
    logger.warn(`field-unchecked: ${submission.cid}: ${checked.reason}${status}`);
    return "publish";
  }
  if (checked.field === "life-sciences") return "publish";
  logger.info(`outside-field: ${submission.cid}: ${checked.reason}`);
  return "outside";
}

function minted(ual: string): Attempt {
  return { kind: "done", outcome: { state: "minted", ual } };
}

function failed(failure: DkgFailure): Attempt {
  const reason =
    failure.status === undefined ? failure.reason : `${failure.reason} (${failure.status})`;
  if (failure.reason === "unauthorized" || failure.reason === "graph-not-served")
    return { kind: "fatal", reason };
  if (failure.reason === "retry-later")
    return { kind: "retry", reason, failure: "network-refused" };
  return { kind: "retry", reason, failure: "node-unreachable" };
}

/**
 * The `publish-paper` Inngest function: a singleton per CID in mode `skip`, so a second
 * event for a PDF being published starts nothing (domain → Inngest), with a 45-minute
 * budget. `getDeps` builds the adapters on the first run, so importing the function
 * validates no settings.
 */
export function createPublishPaper(inngest: Inngest.Any, getDeps: () => PublishDeps) {
  return inngest.createFunction(
    {
      id: "publish-paper",
      triggers: [{ event: PAPER_SUBMITTED }],
      singleton: { key: "event.data.cid", mode: "skip" },
      timeouts: { finish: PUBLISH_SETTINGS.finishTimeout },
    },
    async ({ event, step, logger }) =>
      runPublish(
        event.data,
        {
          run: (id, fn) => step.run(id, fn) as never,
          sleep: (id, duration) => step.sleep(id, duration),
        },
        loadDeps(getDeps),
        event.ts ?? Date.now(),
        logger,
      ),
  );
}

/**
 * The run's adapters from `getDeps`. Settings that are missing or invalid (an `EnvError`)
 * stop the run with a `NonRetriableError` naming them: a retry cannot fix a setting.
 */
export function loadDeps(getDeps: () => PublishDeps): PublishDeps {
  try {
    return getDeps();
  } catch (error) {
    throw stop(
      "setup",
      `publish settings: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}
