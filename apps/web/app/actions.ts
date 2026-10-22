"use server";

import {
  type AnnounceResult,
  getRatingService,
  getUploadService,
  type SubmitResult,
} from "@labstrail/workflows";
import { headers } from "next/headers";
import {
  clientIp,
  requestUploadUrl,
  sendSubmission,
  type UploadUrlAnswer,
} from "../lib/publish/upload-actions.ts";
import { getLimits } from "../lib/server.ts";

/** A signed Pinata URL for one PDF, within the connection's daily limit (ADR 0010, ADR 0035). */
export async function requestUpload(): Promise<UploadUrlAnswer> {
  return requestUploadUrl(clientIp(await headers()), {
    service: getUploadService(),
    urls: getLimits().urls,
    logger: console,
  });
}

/** Checks a signed submission and starts its publish run (ADR 0010). */
export async function submitPaper(input: unknown): Promise<SubmitResult> {
  return sendSubmission(input, {
    service: getUploadService(),
    submissions: getLimits().submissions,
  });
}

/**
 * Locally, starts the rating run of the request a transaction made on Anvil, in place of the
 * Alchemy Notify webhook (ADR 0036); the service refuses it in any other environment.
 */
export async function announceLocalRating(txHash: string): Promise<AnnounceResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, reason: "no-request" };
  return getRatingService().announceLocalRating(txHash as `0x${string}`);
}
