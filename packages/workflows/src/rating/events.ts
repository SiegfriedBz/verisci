import { ratingControllerAbi } from "@labstrail/contracts";
import { decodeEventLog, type Hex } from "viem";

/** The event that starts a rating run: `{ contract, requestId }`. */
export const RATING_REQUESTED = "labstrail/rating.requested";

/** What a rating run needs to find its request: the contract and the request id. */
export interface RatingRequested {
  /** The RatingController's lowercase address. */
  readonly contract: string;
  /** The phase-1 request id, `0x` + 64 lowercase hex. */
  readonly requestId: string;
}

/** A log as viem, an Alchemy Notify webhook or a receipt gives it. */
export interface ContractLog {
  readonly address: string;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

/**
 * The event that starts the rating run for a `Phase1Requested` log, with an id derived from
 * the request id, so a log delivered twice becomes one event (ADR 0017); `undefined` for
 * any other log. The webhook's intake sends it, and locally the page's announce and the
 * `rate-paper` dev script.
 */
export function ratingRequestedEvent(
  log: ContractLog,
): { name: typeof RATING_REQUESTED; id: string; data: RatingRequested } | undefined {
  try {
    const decoded = decodeEventLog({
      abi: ratingControllerAbi,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
    });
    if (decoded.eventName !== "Phase1Requested") return undefined;
    const requestId = decoded.args.requestId.toLowerCase();
    return {
      name: RATING_REQUESTED,
      id: `rating:${requestId}`,
      data: { contract: log.address.toLowerCase(), requestId },
    };
  } catch {
    return undefined;
  }
}
