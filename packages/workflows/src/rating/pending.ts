import type {
  ReadPendingCountResult,
  ReadRequestIdsResult,
  ReadRequestResult,
} from "@labstrail/contracts";
import type { Hex } from "viem";

/**
 * Requests read at once: a page of 100 never puts more than 10 calls at the RPC together, which
 * the rating runs and the pages share.
 */
export const PENDING_CONCURRENCY = 10;

/**
 * The reads of a contract's pending requests, which the reconciler and the health check
 * make; tests pass fakes.
 */
export interface PendingReads {
  readPendingCount(contract: Hex): Promise<ReadPendingCountResult>;
  readPendingIds(contract: Hex, offset: number, limit: number): Promise<ReadRequestIdsResult>;
  readRequest(contract: Hex, requestId: Hex): Promise<ReadRequestResult>;
}

/** A request still pending when read, with the time it was made, in seconds. */
export interface PendingRequest {
  readonly requestId: Hex;
  readonly requestedAt: number;
}

/**
 * Reads `ids`' requests on `contract`, {@link PENDING_CONCURRENCY} at a time: those still
 * pending (one settled since its id was read is left out), and how many did not answer.
 */
export async function readPending(
  reads: PendingReads,
  contract: Hex,
  ids: readonly Hex[],
): Promise<{ readonly pending: PendingRequest[]; readonly unreadable: number }> {
  const pending: PendingRequest[] = [];
  let unreadable = 0;
  for (let start = 0; start < ids.length; start += PENDING_CONCURRENCY) {
    const batch = ids.slice(start, start + PENDING_CONCURRENCY);
    const results = await Promise.all(
      batch.map((requestId) => reads.readRequest(contract, requestId)),
    );
    results.forEach((read, index) => {
      const requestId = batch[index];
      if (!read.ok) unreadable += 1;
      else if (read.request.status === "pending" && requestId) {
        pending.push({ requestId, requestedAt: read.request.requestedAt });
      }
    });
  }
  return { pending, unreadable };
}
