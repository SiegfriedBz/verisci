"use server";

import { getUploadService, type SubmitResult } from "@verisci/agents";
import { headers } from "next/headers";
import { getLimits } from "../lib/server.ts";
import {
  clientIp,
  requestUploadUrl,
  sendSubmission,
  type UploadUrlAnswer,
} from "../lib/upload-actions.ts";

/** A signed Pinata URL for one PDF, within the connection's daily limit (ADR 0010, ADR 0035). */
export async function requestUpload(): Promise<UploadUrlAnswer> {
  return requestUploadUrl(clientIp(await headers()), {
    service: getUploadService(),
    urls: getLimits().urls,
  });
}

/** Checks a signed submission and starts its publish run (ADR 0010). */
export async function submitPaper(input: unknown): Promise<SubmitResult> {
  return sendSubmission(input, {
    service: getUploadService(),
    submissions: getLimits().submissions,
  });
}
