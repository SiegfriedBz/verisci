import type { RatingService, RatingView } from "@labstrail/workflows";
import { cache } from "react";

/**
 * What a rating's page shows: a pending rating's step (scored, saved, minted, then recorded on
 * chain by the oracle), its score once fulfilled, why it was cancelled, or why it cannot be
 * read right now.
 */
export type RatingPageStage =
  | { readonly stage: "scoring" | "saving" | "minting" | "recording" }
  | { readonly stage: "scored"; readonly score: number }
  | { readonly stage: "cancelled"; readonly reason: "invalid-target" | "expired" }
  | { readonly stage: "not-found" | "unavailable" };

/** The stage `readRating`'s answer shows; a pending rating the node did not answer for is `unavailable`. */
export function ratingStage(view: RatingView): RatingPageStage {
  if (!view.ok) return { stage: view.reason };
  const { rating } = view;
  if (rating.status === "fulfilled") return { stage: "scored", score: rating.score ?? 0 };
  if (rating.status === "cancelled")
    return { stage: "cancelled", reason: rating.cancelReason ?? "expired" };
  const step = view.stage ?? "unknown";
  return step === "unknown" ? { stage: "unavailable" } : { stage: step };
}

/** Whether the page stops following: the rating is scored or cancelled, or no contract holds it. */
export function isFinalRating(stage: RatingPageStage): boolean {
  return stage.stage === "scored" || stage.stage === "cancelled" || stage.stage === "not-found";
}

/** Whether `value` reads as a phase-1 request id: `0x` + 64 hex digits, any case. */
export function isRequestId(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * How long a rating page opened right after its request ({@link newRatingPath}) waits for the
 * site's RPC to show the request: the wallet's receipt can come back before the site's RPC
 * holds the block, so the request reads as not found for a few seconds.
 */
export const FRESH_WAIT_MS = 120_000;

/** A rating's page as the Rate button opens it, marked (`?new=1`) as just requested. */
export function newRatingPath(cid: string, requestId: string): string {
  return `/papers/${cid}/ratings/${requestId}?new=1`;
}

/**
 * `view` as a just-requested rating's page shows it: while `waiting` (within `FRESH_WAIT_MS`),
 * a request no contract holds yet reads as `unavailable`, so the page keeps following it.
 */
export function whileFresh(view: RatingView, waiting: boolean): RatingView {
  return waiting && !view.ok && view.reason === "not-found"
    ? { ok: false, reason: "unavailable" }
    : view;
}

/**
 * `service.readRating(requestId)` once per request: the rating page's metadata and its body
 * share one read of the chain and the node (React's `cache`).
 */
export const readRatingOnce = cache(
  (requestId: string, service: Pick<RatingService, "readRating">): Promise<RatingView> =>
    service.readRating(requestId),
);
