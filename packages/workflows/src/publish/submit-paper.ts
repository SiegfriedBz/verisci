import type { AssetResult } from "@labstrail/dkg";
import { describeFailure } from "./failure.ts";
import type { DeleteFileResult, FindFileResult } from "./pinata.ts";
import { PAPER_SUBMITTED, type PublishLogger } from "./publish-paper.ts";
import type { SubmissionRefusal, VerifiedSubmission, VerifyResult } from "./verify-submission.ts";

/**
 * A limiter's answer: `unavailable` when its store could not be read, with what the store
 * threw (as `describeFailure` gives it) or `timeout`, for a log.
 */
export type LimitAnswer = "allowed" | "limited" | { readonly unavailable: string };

/**
 * How many papers each submitter may publish; the web app keeps the counts, in Upstash or,
 * locally without it, in memory (ADR 0035).
 */
export interface SubmitLimiter {
  /** Whether `address` may submit another paper now, without counting one. */
  check(address: string): Promise<LimitAnswer>;
  /** Counts one accepted submission for `address`; a failure to count is not reported. */
  count(address: string): Promise<void>;
}

/** The event {@link submitPaper} sends: no `ts`, so Inngest stamps it on receipt. */
export interface PaperSubmittedEvent {
  readonly id: string;
  readonly name: typeof PAPER_SUBMITTED;
  readonly data: VerifiedSubmission;
}

/** What {@link submitPaper} checks with and sends through. */
export interface SubmitDeps {
  /** `verifySubmission` with this environment's graph and the current time. */
  verify(data: unknown): Promise<VerifyResult>;
  readonly limiter: SubmitLimiter;
  /** The Target KA's state for a canonical CID, from the DKG node. */
  readAsset(cid: string): Promise<AssetResult>;
  /** `findPublicFile` with our Pinata key. */
  findFile(cid: string): Promise<FindFileResult>;
  /** `deleteFile` with our Pinata key. */
  deleteFile(id: string): Promise<DeleteFileResult>;
  /** Sends the event and returns Inngest's id for it; throws when Inngest refuses it. */
  send(event: PaperSubmittedEvent): Promise<string>;
  readonly maxBytes: number;
  /** Where a service that gave no answer is named: the server's log. */
  readonly logger: Pick<PublishLogger, "warn">;
}

/** The services a submission depends on, as its log names them. */
type SubmitService = "chain-rpc" | "upstash" | "pinata" | "inngest";

/** Why a submission is refused; none of them changes on a retry, except `rate-limited` a day later. */
export type SubmitRefusal =
  | SubmissionRefusal
  | "rate-limited"
  | "not-pinned"
  | "too-large"
  | "not-a-pdf";

/**
 * The result of {@link submitPaper}: the canonical CID with Inngest's event id, which the
 * paper's page reads the run by, or with the UAL of the Target KA already published; or why
 * not (`unavailable` is worth trying again).
 */
export type SubmitResult =
  | { readonly ok: true; readonly cid: string; readonly eventId: string; readonly ual?: never }
  | { readonly ok: true; readonly cid: string; readonly ual: string; readonly eventId?: never }
  | { readonly ok: false; readonly reason: SubmitRefusal | "unavailable" };

/**
 * Checks a submission from the upload page, then starts its publish run (ADR 0010): the
 * signature (the same checks as the run), then whether its Target KA is already minted, in
 * which case nothing starts or counts and the result gives its UAL (the KA keeps its first
 * submitter); otherwise the submitter's limit, then the pinned file. A state that cannot be
 * read leaves the check to the run. A file over `maxBytes` or not detected as a PDF is
 * refused; one that is not a PDF is also unpinned, when its asset is known to be missing
 * (ADR 0005). Only a submission whose event was sent is counted. Never throws for an
 * expected failure; a service that gives no answer is logged once, as
 * `submit-unavailable: <service>: <what came back>`, never with a key, a URL or the
 * signature.
 *
 * Each signature sends its own event, but the publish function is a singleton per CID: while
 * a run for this PDF is active, Inngest starts no run for the new event, and the paper's page
 * follows the paper on the node instead.
 */
export async function submitPaper(input: unknown, deps: SubmitDeps): Promise<SubmitResult> {
  const unavailable = (service: SubmitService, detail: string): SubmitResult => {
    deps.logger.warn(`submit-unavailable: ${service}: ${detail}`);
    return { ok: false, reason: "unavailable" };
  };

  const verified = await deps.verify(input);
  if (!verified.ok) {
    return verified.reason === "unreachable"
      ? unavailable("chain-rpc", verified.detail)
      : { ok: false, reason: verified.reason };
  }
  const { submission } = verified;

  const asset = await deps.readAsset(submission.cid);
  if (asset.ok && asset.state === "minted")
    return { ok: true, cid: submission.cid, ual: asset.ual };

  const allowed = await deps.limiter.check(submission.submitter);
  if (typeof allowed === "object") return unavailable("upstash", allowed.unavailable);
  if (allowed === "limited") return { ok: false, reason: "rate-limited" };

  const found = await deps.findFile(submission.cid);
  if (!found.ok) {
    return found.reason === "missing"
      ? { ok: false, reason: "not-pinned" }
      : unavailable("pinata", found.detail);
  }
  // The refusal and the unpin share this one test of a PDF, so whatever a file is refused
  // as, only one the refusal counts as not a PDF is ever unpinned.
  const pdf = found.file.mimeType === "application/pdf";
  const refusal = found.file.size > deps.maxBytes ? "too-large" : pdf ? undefined : "not-a-pdf";
  if (refusal) {
    // Every environment shares Pinata's one file per CID, and a size limit may differ between
    // them: unpin only a file no environment publishes, one that is not a PDF.
    if (!pdf && asset.ok && asset.state === "missing") await deps.deleteFile(found.file.id);
    return { ok: false, reason: refusal };
  }

  let eventId: string;
  try {
    eventId = await deps.send({
      // One event per signed submission: a retry of the same one is deduplicated for 24
      // hours, while a new signature (a new deadline) is a new event, so publishing a refused
      // or stopped paper again is never skipped. It starts no run while one holds this CID.
      id: `paper:${submission.cid}:${submission.submitter}:${submission.deadline}`,
      name: PAPER_SUBMITTED,
      data: submission,
    });
  } catch (error) {
    return unavailable("inngest", describeFailure(error));
  }
  await deps.limiter.count(submission.submitter);
  return { ok: true, cid: submission.cid, eventId };
}
