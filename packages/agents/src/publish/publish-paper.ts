import { type PaperMetadata, targetKaName, targetKaQuads } from "@verisci/core";
import type { DkgClient, DkgFailure } from "@verisci/dkg";
import { type Inngest, NonRetriableError } from "inngest";
import type { SubmissionRefusal, VerifiedSubmission, VerifyResult } from "./verify-submission.ts";

/** The event that starts a publish: `{ cid, contextGraph, deadline, submitter, signature }`. */
export const PAPER_SUBMITTED = "verisci/paper.submitted";

/** The publish run's limits (ADR 0008, ADR 0009). */
export const PUBLISH_SETTINGS = {
  /** Largest PDF read from the gateway. */
  maxPdfBytes: 30 * 1024 * 1024,
  /** How long `startMint` listens for the node's answer. */
  listenMs: 10_000,
  pollInterval: "30s",
  /** Polls before a mint is started again: 10 minutes at 30 s. */
  pollsPerMint: 20,
  retryWait: "2m",
  attempts: 5,
  /** A run's whole budget, enforced by Inngest. */
  finishTimeout: "45m",
} as const;

/** Why a paper cannot be published; a retry would not change it. */
export type PaperRefusal = "not-a-pdf" | "too-large" | "unparseable" | "no-title";

/** The result of reading a paper: its metadata, or why not (`unreachable` is worth a retry). */
export type ReadPaperResult =
  | { readonly ok: true; readonly metadata: PaperMetadata }
  | { readonly ok: false; readonly reason: PaperRefusal | "unreachable" };

/** How a publish run ends, unless it fails. */
export type PublishOutcome =
  | { readonly state: "minted"; readonly ual: string }
  | { readonly state: "refused"; readonly reason: SubmissionRefusal | PaperRefusal };

/** The step tools a publish run uses: Inngest's `step.run` and `step.sleep`. */
export interface PublishSteps {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
  sleep(id: string, duration: string): Promise<void>;
}

/** The adapters a publish run calls. */
export interface PublishDeps {
  verifySubmission(data: unknown): Promise<VerifyResult>;
  /** Fetches the PDF and parses its header, in one step so its bytes are never a step output. */
  readPaper(cid: string): Promise<ReadPaperResult>;
  readonly dkg: Pick<DkgClient, "readAsset" | "storeAsset" | "startMint">;
}

type Attempt =
  | { readonly kind: "done"; readonly outcome: PublishOutcome }
  | { readonly kind: "retry"; readonly reason: string }
  | { readonly kind: "mint-again" }
  | { readonly kind: "fatal"; readonly reason: string };

/**
 * Publishes a paper as a Target KA (ADR 0010): checks the submission, then reads the KA's
 * state and does only what is left (ADR 0007): read the paper, store, mint, poll. A KA
 * already stored or minted keeps its first submitter.
 *
 * A failure worth a retry waits `retryWait` with `step.sleep` and starts again from the
 * read, for `attempts` attempts (ADR 0009); a mint not seen after `pollsPerMint` polls is
 * started again (ADR 0008). Throws `NonRetriableError` when the node refuses the token or
 * does not serve the graph, and when the attempts run out.
 */
export async function runPublish(
  data: unknown,
  step: PublishSteps,
  deps: PublishDeps,
): Promise<PublishOutcome> {
  const verified = await verify(data, step, deps);
  if (!verified.ok) return { state: "refused", reason: verified.reason };
  const { submission } = verified;
  const name = targetKaName(submission.cid);
  if (!name.ok) return { state: "refused", reason: "bad-cid" };

  let last = "";
  for (let attempt = 1; attempt <= PUBLISH_SETTINGS.attempts; attempt++) {
    const result = await publishOnce(attempt, name.name, submission, step, deps);
    if (result.kind === "done") return result.outcome;
    if (result.kind === "fatal")
      throw new NonRetriableError(`publish of ${name.name}: ${result.reason}`);
    last = result.kind === "retry" ? result.reason : "mint not seen";
    if (result.kind === "retry" && attempt < PUBLISH_SETTINGS.attempts) {
      await step.sleep(`retry-${attempt}`, PUBLISH_SETTINGS.retryWait);
    }
  }
  throw new NonRetriableError(
    `publish of ${name.name} gave up after ${PUBLISH_SETTINGS.attempts} attempts: ${last}`,
  );
}

async function verify(
  data: unknown,
  step: PublishSteps,
  deps: PublishDeps,
): Promise<
  { ok: true; submission: VerifiedSubmission } | { ok: false; reason: SubmissionRefusal }
> {
  for (let attempt = 1; ; attempt++) {
    const result = await step.run(attempt === 1 ? "verify" : `verify-${attempt}`, () =>
      deps.verifySubmission(data),
    );
    if (result.ok || result.reason !== "unreachable") return result as never;
    if (attempt === PUBLISH_SETTINGS.attempts) {
      throw new NonRetriableError(
        `submission of ${String((data as { cid?: unknown })?.cid)}: chain unreachable`,
      );
    }
    await step.sleep(`verify-retry-${attempt}`, PUBLISH_SETTINGS.retryWait);
  }
}

async function publishOnce(
  attempt: number,
  name: string,
  submission: VerifiedSubmission,
  step: PublishSteps,
  deps: PublishDeps,
): Promise<Attempt> {
  const read = await step.run(`read-${attempt}`, () => deps.dkg.readAsset(name));
  if (!read.ok) return failed(read);
  if (read.state === "minted") return minted(read.ual);

  if (read.state === "missing" || read.state === "draft") {
    const paper = await step.run(`read-paper-${attempt}`, () => deps.readPaper(submission.cid));
    if (!paper.ok) {
      return paper.reason === "unreachable"
        ? { kind: "retry", reason: "paper unreachable" }
        : { kind: "done", outcome: { state: "refused", reason: paper.reason } };
    }
    const quads = targetKaQuads(paper.metadata, {
      ...submission,
      deadline: BigInt(submission.deadline),
    });
    const stored = await step.run(`store-${attempt}`, () => deps.dkg.storeAsset(name, quads));
    if (!stored.ok) return failed(stored);
    if (stored.state === "minted") return minted(stored.ual);
  }

  const mint = await step.run(`mint-${attempt}`, () =>
    deps.dkg.startMint(name, { listenMs: PUBLISH_SETTINGS.listenMs }),
  );
  if (!mint.ok) return failed(mint);
  if (mint.state === "minted") return minted(mint.ual);

  for (let poll = 1; poll <= PUBLISH_SETTINGS.pollsPerMint; poll++) {
    await step.sleep(`wait-${attempt}-${poll}`, PUBLISH_SETTINGS.pollInterval);
    const state = await step.run(`poll-${attempt}-${poll}`, () => deps.dkg.readAsset(name));
    if (!state.ok) return failed(state);
    if (state.state === "minted") return minted(state.ual);
  }
  return { kind: "mint-again" };
}

function minted(ual: string): Attempt {
  return { kind: "done", outcome: { state: "minted", ual } };
}

function failed(failure: DkgFailure): Attempt {
  const reason =
    failure.status === undefined ? failure.reason : `${failure.reason} (${failure.status})`;
  return failure.reason === "unauthorized" || failure.reason === "graph-not-served"
    ? { kind: "fatal", reason }
    : { kind: "retry", reason };
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
    async ({ event, step }) =>
      runPublish(
        event.data,
        {
          run: (id, fn) => step.run(id, fn) as never,
          sleep: (id, duration) => step.sleep(id, duration),
        },
        getDeps(),
      ),
  );
}
