import { canonicalCid } from "@labstrail/core";
import type {
  PublishedRecord,
  PublishLogger,
  SubmitLimiter,
  SubmitResult,
  UploadService,
} from "@labstrail/workflows";
import { cache } from "react";
import type { Counter } from "./limits.ts";
import { eventTime, type PaperStage, paperProgress } from "./progress.ts";

/** What {@link requestUploadUrl} returns to the browser (ADR 0021). */
export type UploadUrlAnswer =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: "rate-limited" | "unavailable" };

/**
 * What a paper's page shows: its stage, and once published its record, or why it could not
 * be read (ADR 0021).
 */
export type PaperView = PaperStage & {
  readonly record?: PublishedRecord;
  readonly recordProblem?: "unavailable" | "unreadable";
};

/** Inngest's event ids are ULIDs. */
const EVENT_ID = /^[0-9A-Z]{26}$/;

/**
 * Signs an upload URL for a connection under its daily limit, counted by IP (ADR 0035). A
 * service that gives no answer is logged once, as `upload-url-unavailable: <service>: <what
 * came back>`, never with a key or a URL.
 */
export async function requestUploadUrl(
  ip: string,
  deps: { service: UploadService; urls: Counter; logger: Pick<PublishLogger, "warn"> },
): Promise<UploadUrlAnswer> {
  const unavailable = (service: "upstash" | "pinata", detail: string): UploadUrlAnswer => {
    deps.logger.warn(`upload-url-unavailable: ${service}: ${detail}`);
    return { ok: false, reason: "unavailable" };
  };
  const allowed = await deps.urls.take(ip);
  if (allowed === "limited") return { ok: false, reason: "rate-limited" };
  if (typeof allowed === "object") return unavailable("upstash", allowed.unavailable);
  const signed = await deps.service.createUploadUrl();
  return signed.ok ? signed : unavailable("pinata", signed.detail);
}

/** Checks a signed submission and starts its publish run, under the per-address limit. */
export function sendSubmission(
  input: unknown,
  deps: { service: UploadService; submissions: SubmitLimiter },
): Promise<SubmitResult> {
  return deps.service.submitPaper(input, deps.submissions);
}

/**
 * Where a paper stands, for its page, with its record once published: a CID that is not one
 * an upload gives is `not-found`, and an event id that is not Inngest's is ignored.
 */
export async function readProgress(
  cid: string,
  eventId: string | undefined,
  service: UploadService,
): Promise<PaperView> {
  const canonical = canonicalCid(cid);
  if (canonical === undefined) return { stage: "not-found" };
  const event = eventId !== undefined && EVENT_ID.test(eventId) ? eventId : undefined;
  const status = await service.readPaper(canonical, event);
  const stage = paperProgress(
    status,
    Date.now(),
    event === undefined ? undefined : eventTime(event),
  );
  if (stage.stage !== "published") return stage;
  if (status.record) return { ...stage, record: status.record };
  // A run's mint can show before the node does: its record is not readable yet.
  return { ...stage, recordProblem: status.recordProblem ?? "unavailable" };
}

/**
 * {@link readProgress} once per request: the paper page's metadata and its body share one read
 * of the node (React's `cache`).
 */
export const readProgressOnce = cache(readProgress);

/** The visitor's address as the host forwards it (Vercel sets both headers). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
