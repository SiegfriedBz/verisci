import { ratingControllerAbi } from "@labstrail/contracts";
import type { AnnounceResult } from "@labstrail/workflows";
import { decodeEventLog, type Hex } from "viem";
import type { RequestProblem } from "./messages.ts";

/** A log as a transaction receipt gives it. */
export interface ReceiptLog {
  readonly address: string;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

/** What {@link requestRating} calls; the button passes the wallet and the server action. */
export interface RequestDeps {
  /** The chain the environment's current contract is on: Base Sepolia, or Anvil locally. */
  readonly chainId: number;
  /** The contract that takes new requests, lowercase. */
  readonly contract: string;
  /** True when `APP_ENV=local`, where no webhook watches the chain. */
  readonly local: boolean;
  /** The connected wallet, or `undefined`. */
  account(): { readonly address: string; readonly chainId: number | undefined } | undefined;
  /** Opens the wallet window. */
  connect(): void;
  switchChain(chainId: number): Promise<void>;
  /** Sends `requestPhase1(ual)` from the wallet and returns its hash; throws when refused or reverted. */
  sendRequest(ual: string): Promise<Hex>;
  /** The mined transaction's status and logs, or `undefined` when no receipt came in time. */
  waitForReceipt(
    hash: Hex,
  ): Promise<{ readonly reverted: boolean; readonly logs: readonly ReceiptLog[] } | undefined>;
  /** Locally, has the server send the request's event (`announceLocalRating`). */
  announce(hash: Hex): Promise<AnnounceResult>;
}

/**
 * The result of {@link requestRating}: the request id to follow, or the transaction's hash when
 * its receipt never came, or why nothing was requested. `notAnnounced` means the local announce
 * failed: the request exists, but no run started.
 */
export type RequestResult =
  | { readonly ok: true; readonly requestId: string; readonly notAnnounced?: true }
  | { readonly ok: true; readonly unconfirmed: Hex }
  | { readonly ok: false; readonly problem: RequestProblem | "connect" | "declined" };

/**
 * Requests a phase-1 rating of `ual` from the visitor's wallet (ADRs 0015, 0031): connects the
 * wallet or switches its chain when needed, sends `requestPhase1` to the current contract, reads
 * the request id from the receipt's `Phase1Requested` log, then, locally only, has the server
 * announce it, since no Alchemy Notify webhook watches Anvil (ADR 0036). A transaction mined
 * but reverted (the cap filled or the contract paused after the wallet's check) is `refused`.
 */
export async function requestRating(ual: string, deps: RequestDeps): Promise<RequestResult> {
  const account = deps.account();
  if (!account) {
    deps.connect();
    return { ok: false, problem: "connect" };
  }
  let hash: Hex;
  try {
    if (account.chainId !== deps.chainId) await deps.switchChain(deps.chainId);
    hash = await deps.sendRequest(ual);
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
  const receipt = await deps.waitForReceipt(hash).catch(() => undefined);
  if (receipt?.reverted) return { ok: false, problem: "refused" };
  const requestId = receipt && requestIdOf(receipt.logs, deps.contract);
  if (!requestId) return { ok: true, unconfirmed: hash };
  if (!deps.local) return { ok: true, requestId };
  const announced = await deps.announce(hash).catch(() => ({ ok: false as const }));
  return announced.ok ? { ok: true, requestId } : { ok: true, requestId, notAnnounced: true };
}

/** The request id in this contract's `Phase1Requested` log, lowercase. */
function requestIdOf(logs: readonly ReceiptLog[], contract: string): string | undefined {
  for (const log of logs) {
    if (log.address.toLowerCase() !== contract) continue;
    try {
      const decoded = decodeEventLog({
        abi: ratingControllerAbi,
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data,
      });
      if (decoded.eventName === "Phase1Requested") return decoded.args.requestId.toLowerCase();
    } catch {
      // Another event of this contract.
    }
  }
  return undefined;
}

/**
 * Why sending failed, from viem's chain of causes: the visitor refused, the contract reverted
 * with `TooManyPending` (ADR 0015) or `EnforcedPause` (ADR 0023), or anything else.
 */
function problemOf(error: unknown): RequestProblem | "declined" {
  for (let cause = error; cause !== undefined && cause !== null; ) {
    const named = cause as { name?: unknown; data?: { errorName?: unknown }; cause?: unknown };
    if (named.name === "UserRejectedRequestError") return "declined";
    if (named.data?.errorName === "TooManyPending") return "too-many-pending";
    if (named.data?.errorName === "EnforcedPause") return "paused";
    cause = named.cause;
  }
  return "unavailable";
}
