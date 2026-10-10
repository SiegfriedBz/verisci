import type { PublishFailure, SubmitResult } from "@verisci/workflows";
import type { RefusalReason } from "./progress.ts";
import type { UploadUrlAnswer } from "./upload-actions.ts";

/** Why the publish form stopped, from the browser's own checks to the server's answers. */
export type PublishProblem =
  | Extract<UploadUrlAnswer, { ok: false }>["reason"]
  | Extract<SubmitResult, { ok: false }>["reason"]
  | "upload-failed"
  | "signature-declined"
  | "wrong-file";

/** What the publish form says when it stops, in plain words. */
export function publishProblemMessage(problem: PublishProblem): string {
  switch (problem) {
    case "rate-limited":
      return "You've reached the limit for the last 24 hours. Try again later.";
    case "unavailable":
      return "A service we rely on didn't answer. Try again in a minute.";
    case "upload-failed":
    case "not-pinned":
      return "The upload didn't finish. Try uploading the file again.";
    case "signature-declined":
      return "You declined the signature, so nothing was published.";
    case "bad-signature":
      return "The signature didn't match your wallet. Try signing again.";
    case "expired":
      return "The signature expired before it reached us. Sign again.";
    case "too-large":
      return "This file is over 30 MB. Try a smaller PDF.";
    case "not-a-pdf":
    case "wrong-file":
      return "This file isn't a PDF. Choose a PDF of your paper.";
    case "malformed":
    case "bad-cid":
    case "wrong-graph":
      return "Something went wrong while preparing your paper. Try again.";
  }
}

/** Why a publish run stopped, for its page; a run that named no reason gets the general message. */
export function failureMessage(reason: PublishFailure | undefined): string {
  switch (reason) {
    case "chain-unreachable":
      return "We couldn't reach Base to check your signature, even after several tries. Publish the same PDF again in a few minutes.";
    case "paper-unreachable":
      return "We couldn't read your PDF: the IPFS gateway or our paper reader didn't answer, even after several tries. Publish the same PDF again in a few minutes.";
    case "node-unreachable":
      return "VeriSci's DKG node didn't answer, even after several tries. Publish the same PDF again in a few minutes: it picks up where it stopped.";
    case "mint-not-confirmed":
      return "The mint on Base wasn't confirmed in time. Publish the same PDF again: if it was minted meanwhile, the page shows it.";
    case "setup":
      return "Publishing stopped because of a problem on our side, not with your paper. We need to fix it before it can work.";
    default:
      return "We couldn't finish publishing this paper. Publish the same PDF again and we'll pick up where it stopped.";
  }
}

/** Why a publish run refused a paper, for its page. */
export function refusalMessage(reason: RefusalReason): string {
  switch (reason) {
    case "not-a-pdf":
      return "The file isn't a readable PDF.";
    case "too-large":
      return "The file is over 30 MB.";
    case "unparseable":
      return "We couldn't read the first page of this PDF.";
    case "no-title":
      return "We couldn't find a title on the first page of this PDF. If its pages are pictures (a scan, or a PDF saved from a browser's viewer), we can't read them: use the publisher's original PDF.";
    case "expired":
      return "The signature expired before the paper was read. Publish it again.";
    case "bad-signature":
    case "malformed":
    case "bad-cid":
    case "wrong-graph":
      return "The submission didn't pass our checks. Publish it again.";
  }
}
