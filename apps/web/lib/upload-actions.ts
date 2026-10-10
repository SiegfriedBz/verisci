import type { SubmitLimiter, SubmitResult, UploadService } from "@verisci/agents";
import { canonicalCid } from "@verisci/core";
import type { Counter } from "./limits.ts";
import { type PaperStage, paperProgress } from "./progress.ts";

/** What {@link requestUploadUrl} returns to the browser (ADR 0021). */
export type UploadUrlAnswer =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: "rate-limited" | "unavailable" };

/** Inngest's event ids are ULIDs. */
const EVENT_ID = /^[0-9A-Z]{26}$/;

/** Signs an upload URL for a connection under its daily limit, counted by IP (ADR 0035). */
export async function requestUploadUrl(
  ip: string,
  deps: { service: UploadService; urls: Counter },
): Promise<UploadUrlAnswer> {
  const allowed = await deps.urls.take(ip);
  if (allowed === "limited") return { ok: false, reason: "rate-limited" };
  if (allowed === "unavailable") return { ok: false, reason: "unavailable" };
  const signed = await deps.service.createUploadUrl();
  return signed.ok ? signed : { ok: false, reason: "unavailable" };
}

/** Checks a signed submission and starts its publish run, under the per-address limit. */
export function sendSubmission(
  input: unknown,
  deps: { service: UploadService; submissions: SubmitLimiter },
): Promise<SubmitResult> {
  return deps.service.submitPaper(input, deps.submissions);
}

/**
 * Where a paper stands, for its page: a CID that is not one an upload gives is
 * `not-found`, and an event id that is not Inngest's is ignored.
 */
export async function readProgress(
  cid: string,
  eventId: string | undefined,
  service: UploadService,
): Promise<PaperStage> {
  const canonical = canonicalCid(cid);
  if (canonical === undefined) return { stage: "not-found" };
  const event = eventId !== undefined && EVENT_ID.test(eventId) ? eventId : undefined;
  return paperProgress(await service.readPaper(canonical, event));
}

/** The visitor's address as the host forwards it (Vercel sets both headers). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
