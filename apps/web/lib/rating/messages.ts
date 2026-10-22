import type { PaperRatingSummary } from "@labstrail/workflows";

/**
 * Why a rating request did not go through, as the request flow names it: `refused` is a
 * transaction the contract reverted once mined; `wallet-unavailable`, the wallet's code that
 * couldn't download when the Rate button loaded it.
 */
export type RequestProblem =
  | "too-many-pending"
  | "paused"
  | "refused"
  | "unavailable"
  | "wallet-unavailable";

/** What a cancelled rating's page says, by the reason the oracle recorded. */
export function cancelMessage(reason: "invalid-target" | "expired"): {
  readonly title: string;
  readonly body: string;
} {
  return reason === "invalid-target"
    ? {
        title: "This paper can't be rated",
        body: "LabsTrail rates life-science and health papers it published itself, and reads them from their PDF. This one is outside the life sciences and health, its PDF's text couldn't be read (a scan, or a file over the size limit), its address isn't one of LabsTrail's papers, or the scoring model couldn't give a usable answer for it.",
      }
    : {
        title: "The rating couldn't finish within a day",
        body: "Something on our side kept the rating from finishing, such as the scoring model being unavailable all day. Nothing was recorded. You can ask for a new rating.",
      };
}

/** What the paper page says when a rating request didn't go through. */
export function requestMessage(problem: RequestProblem): string {
  switch (problem) {
    case "too-many-pending":
      return "You already have 3 ratings waiting. Try again when one finishes.";
    case "paused":
      return "Ratings are paused for now.";
    case "refused":
      return "The contract refused your request, so no rating was asked for: you may already have 3 ratings waiting, or ratings may be paused. The transaction's gas was still spent.";
    case "unavailable":
      return "Your request didn't go through. Check your wallet and try again.";
    case "wallet-unavailable":
      return "The wallet couldn't load. Check your connection and try again.";
  }
}

/**
 * A paper's rating in the papers list: its score, `Pending`, `Can't be rated` (a request was
 * cancelled `invalid-target`), `Not rated`, or `Not checked` when the chain did not answer.
 */
export function summaryLabel(summary: PaperRatingSummary): string {
  switch (summary.kind) {
    case "scored":
      return String(summary.score);
    case "pending":
      return "Pending";
    case "cannot-rate":
      return "Can't be rated";
    case "unrated":
      return "Not rated";
    case "unknown":
      return "Not checked";
  }
}
