import type { SubmitResult } from "@verisci/agents";
import { canonicalCid, submissionTypedData } from "@verisci/core";
import type { PublishProblem } from "./messages.ts";
import type { UploadUrlAnswer } from "./upload-actions.ts";

/** Where the publish form is, once a file is chosen. */
export type Phase = "uploading" | "signing" | "submitting";

/** What {@link publishFile} calls; the form passes the server actions and the wallet. */
export interface FlowDeps {
  /** This environment's context graph id, as the server gives it. */
  readonly contextGraph: string;
  readonly maxBytes: number;
  readonly signatureLifetimeS: number;
  readonly now: () => number;
  requestUpload(): Promise<UploadUrlAnswer>;
  /** Uploads the file to the signed URL and returns the CID Pinata gives, or undefined. */
  upload(url: string, file: File): Promise<string | undefined>;
  /** Asks the wallet to sign; `ok: false` when the visitor declines. */
  sign(
    typedData: ReturnType<typeof submissionTypedData>,
  ): Promise<{ ok: true; address: string; signature: string } | { ok: false }>;
  submit(input: unknown): Promise<SubmitResult>;
  onPhase(phase: Phase): void;
}

/** The result of {@link publishFile}: the paper's CID and run, or why it stopped. */
export type FlowResult =
  | { readonly ok: true; readonly cid: string; readonly eventId: string }
  | { readonly ok: false; readonly problem: PublishProblem };

/**
 * Publishes one file from the browser (ADR 0010): checks it is a PDF within the size cap,
 * uploads it to a signed URL, signs its canonical CID with a deadline `signatureLifetimeS`
 * ahead, then submits. Anything thrown on the way reads as `unavailable`.
 */
export async function publishFile(file: File, deps: FlowDeps): Promise<FlowResult> {
  if (file.type !== "application/pdf") return { ok: false, problem: "wrong-file" };
  if (file.size > deps.maxBytes) return { ok: false, problem: "too-large" };
  try {
    deps.onPhase("uploading");
    const signedUrl = await deps.requestUpload();
    if (!signedUrl.ok) return { ok: false, problem: signedUrl.reason };
    const uploaded = await deps.upload(signedUrl.url, file);
    const cid = uploaded === undefined ? undefined : canonicalCid(uploaded);
    if (cid === undefined) return { ok: false, problem: "upload-failed" };

    deps.onPhase("signing");
    const deadline = BigInt(Math.floor(deps.now() / 1000) + deps.signatureLifetimeS);
    const signed = await deps.sign(
      submissionTypedData({ cid, contextGraph: deps.contextGraph, deadline }),
    );
    if (!signed.ok) return { ok: false, problem: "signature-declined" };

    deps.onPhase("submitting");
    const submitted = await deps.submit({
      cid,
      contextGraph: deps.contextGraph,
      deadline: deadline.toString(),
      submitter: signed.address,
      signature: signed.signature,
    });
    return submitted.ok
      ? { ok: true, cid: submitted.cid, eventId: submitted.eventId }
      : { ok: false, problem: submitted.reason };
  } catch {
    return { ok: false, problem: "unavailable" };
  }
}

/**
 * Uploads a file to a Pinata signed URL on the public network, so its gateway serves it,
 * and returns the CID Pinata answers, or undefined when the upload is refused.
 */
export async function uploadToSignedUrl(
  url: string,
  file: File,
  fetchFn: typeof fetch = fetch,
): Promise<string | undefined> {
  const form = new FormData();
  form.append("file", file);
  form.append("network", "public");
  const response = await fetchFn(url, { method: "POST", body: form });
  if (!response.ok) return undefined;
  const body = (await response.json()) as { data?: { cid?: unknown } };
  return typeof body.data?.cid === "string" ? body.data.cid : undefined;
}
