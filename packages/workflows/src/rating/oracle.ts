import {
  cancelCalldata,
  fulfilCalldata,
  type ReadOracleResult,
  type ReadRequestResult,
} from "@labstrail/contracts";
import { type Inngest, NonRetriableError } from "inngest";
import type { Hex } from "viem";
import { z } from "zod";

/** The oracle function's limits (ADR 0019). */
export const ORACLE_SETTINGS = {
  /** Between receipt checks; Base makes a block every 2 s. */
  receiptPoll: "5s",
  /** How long a sent transaction waits unmined before its fees are raised. */
  bumpAfterMs: 60_000,
  /** How much each raise adds to both fees; the node wants at least 10 (`docs/domain.md` → Chain). */
  bumpPercent: 15n,
  /** The most `maxFeePerGas` any oracle transaction carries: 10 gwei. */
  feeCapWei: 10_000_000_000n,
  /** Between checks while a transaction is in flight or the chain does not answer. */
  busyPoll: "15s",
  /** How long a transaction in flight holds the lane before its nonce is replaced. */
  busyLimitMs: 600_000,
  /** Each RPC call's timeout, set on the chain client, which makes one try: steps retry. */
  rpcTimeoutMs: 10_000,
  /** How long a run may try before it fails `oracle-stuck`, inside `finishTimeout`. */
  budgetMs: 1_500_000,
  /** A run's whole budget, enforced by Inngest. */
  finishTimeout: "30m",
} as const;

/** What the oracle is asked to record. */
export type OracleAction =
  | { readonly kind: "fulfil"; readonly score: number; readonly rKaUal: string }
  | { readonly kind: "cancel"; readonly reason: "expired" | "invalid-target" };

/** The oracle function's input: which request, on which contract, and what to record. */
export interface OracleInput {
  /** The RatingController's lowercase address. */
  readonly contract: string;
  readonly requestId: Hex;
  readonly action: OracleAction;
}

/**
 * Where the request stands once the oracle is done: settled by this run or an earlier one,
 * `not-our-oracle` when the contract's oracle is another key, `unknown` when the contract no
 * longer knows the request (a reorg dropped it).
 */
export type OracleResult =
  | { readonly state: "fulfilled"; readonly score: number; readonly rKaUal: string }
  | { readonly state: "cancelled"; readonly reason: "expired" | "invalid-target" }
  | { readonly state: "not-our-oracle" }
  | { readonly state: "unknown" };

/** Both EIP-1559 fees, in wei. */
export interface Fees {
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
}

/**
 * Why a send did not go out: `in-flight` (nonce too low, already known or underpriced: a
 * transaction holds the nonce), `reverted` (the call would revert, so the request moved),
 * `no-funds` (the oracle cannot pay its gas) or `unreachable`.
 */
export type SendResult =
  | { readonly ok: true; readonly hash: Hex }
  | { readonly ok: false; readonly reason: "in-flight" | "reverted" | "no-funds" | "unreachable" };

/** The chain as the oracle function uses it, signing with the oracle's key. */
export interface OracleChain {
  /** The oracle's lowercase address. */
  readonly account: string;
  /** The current time in milliseconds. */
  now(): number;
  /** The account's latest and pending nonces. */
  nonces(): Promise<
    | { readonly ok: true; readonly latest: number; readonly pending: number }
    | { readonly ok: false }
  >;
  readRequest(contract: Hex, requestId: Hex): Promise<ReadRequestResult>;
  readOracle(contract: Hex): Promise<ReadOracleResult>;
  estimateFees(): Promise<{ readonly ok: true; readonly fees: Fees } | { readonly ok: false }>;
  send(transaction: {
    readonly to: string;
    readonly data: Hex;
    readonly nonce: number;
    readonly fees: Fees;
  }): Promise<SendResult>;
  /** `none` while a transaction is not mined. */
  receipt(
    hash: Hex,
  ): Promise<
    { readonly ok: true; readonly state: "none" | "success" | "reverted" } | { readonly ok: false }
  >;
}

/** The step tools an oracle run uses: Inngest's `step.run` and `step.sleep`. */
export interface OracleSteps {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
  sleep(id: string, duration: string): Promise<void>;
}

/** Where the oracle logs its tagged errors; those that need the maintainer also go to `alert`. */
export interface OracleLogger {
  error(message: string): void;
}

/** Why an oracle run stopped: another R-KA recorded, nothing mined in time, or bad input or settings. */
export type OracleFailure = "oracle-conflict" | "oracle-stuck" | "setup";

/** A transaction sent at one nonce, with every hash sent there; fees as decimal strings, as steps keep JSON. */
interface SentTx {
  readonly nonce: number;
  readonly hashes: readonly Hex[];
  readonly maxFeePerGas: string;
  readonly maxPriorityFeePerGas: string;
  readonly sentAt: number;
  readonly atCap: boolean;
}

type SendStep =
  | { readonly kind: "done"; readonly at: number; readonly result: OracleResult }
  | { readonly kind: "conflict"; readonly at: number; readonly rKaUal: string }
  | { readonly kind: "busy"; readonly at: number }
  | { readonly kind: "again"; readonly at: number; readonly noFunds?: string }
  | { readonly kind: "sent"; readonly at: number; readonly tx: SentTx };

type ReceiptStep =
  | { readonly kind: "mined"; readonly at: number }
  | { readonly kind: "again"; readonly at: number }
  | { readonly kind: "pending"; readonly at: number; readonly tx: SentTx };

/** The error that stops a run, with its reason first in the message. */
function stop(reason: OracleFailure, detail: string, cause?: unknown): NonRetriableError {
  return new NonRetriableError(`oracle-failed:${reason}: ${detail}`, { cause });
}

const inputSchema = z.object({
  contract: z.string().regex(/^0x[0-9a-f]{40}$/),
  requestId: z.string().regex(/^0x[0-9a-f]{64}$/),
  action: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("fulfil"),
      score: z.int().min(0).max(100),
      rKaUal: z.string().min(1),
    }),
    z.object({ kind: z.literal("cancel"), reason: z.enum(["expired", "invalid-target"]) }),
  ]),
});

/** The oracle's input from an invocation's data; anything else stops the run (`setup`). */
export function parseOracleInput(data: unknown): OracleInput {
  const parsed = inputSchema.safeParse(data);
  if (!parsed.success) throw stop("setup", "the invocation's data is not an oracle input");
  return parsed.data as OracleInput;
}

/**
 * Records a rating's score or cancels its request on chain, as the only sender of the oracle's
 * transactions (ADR 0019). A step reads the account's nonces, the request and the contract's
 * oracle, decides (ADR 0007) and sends; later steps check the receipt every `receiptPoll`.
 *
 * - A request already settled sends nothing; one fulfilled with another R-KA fails
 *   `oracle-conflict`, which should never happen.
 * - A transaction in flight (pending nonce above latest, or a send refused as such) holds back
 *   the send; after `busyLimitMs` its nonce is replaced by a zero-value transfer to itself,
 *   priced one raise above the fee cap.
 * - Unmined after `bumpAfterMs`, the same call goes out again at the same nonce with both fees
 *   raised by `bumpPercent`, up to `feeCapWei`; at the cap it is logged and the checks go on.
 * - A reverted receipt, or a nonce another transaction took, reads the request again.
 * - Nothing settled within `budgetMs` fails `oracle-stuck`.
 *
 * An oracle without funds, and a transaction at the fee cap, are logged and alerted on (`alert`,
 * ADR 0038), each once a run, from a step of its own so a replay never sends it again.
 */
export async function runOracle(
  input: OracleInput,
  step: OracleSteps,
  chain: OracleChain,
  logger: OracleLogger,
  alert: (message: string) => Promise<void>,
): Promise<OracleResult> {
  const data =
    input.action.kind === "fulfil"
      ? fulfilCalldata(input.requestId, input.action.score, input.action.rKaUal)
      : cancelCalldata(input.requestId, input.action.reason);
  let startedAt: number | undefined;
  let busySince: number | undefined;
  // Rebuilt on every replay from the memoized steps, so each alert step runs once a run.
  let alertedNoFunds = false;
  let alertedFeeCap = false;
  const overBudget = (at: number) => {
    startedAt ??= at;
    if (at - startedAt >= ORACLE_SETTINGS.budgetMs) {
      throw stop("oracle-stuck", `request ${input.requestId}: nothing settled in time`);
    }
  };

  for (let attempt = 1; ; attempt++) {
    const sent = await step.run(`send-${attempt}`, () => sendStep(input, data, chain, logger));
    if (sent.kind === "done") return sent.result;
    if (sent.kind === "conflict") {
      const detail = `request ${input.requestId} fulfilled with ${sent.rKaUal}, not ${
        input.action.kind === "fulfil" ? input.action.rKaUal : "a cancel"
      }`;
      logger.error(`oracle-conflict: ${detail}`);
      throw stop("oracle-conflict", detail);
    }
    overBudget(sent.at);

    if (sent.kind === "busy") {
      busySince ??= sent.at;
      if (sent.at - busySince >= ORACLE_SETTINGS.busyLimitMs) {
        await step.run(`unstick-${attempt}`, () => unstick(chain));
        busySince = undefined;
      }
      await step.sleep(`wait-${attempt}`, ORACLE_SETTINGS.busyPoll);
      continue;
    }
    busySince = undefined;
    if (sent.kind === "again") {
      const { noFunds } = sent;
      if (noFunds && !alertedNoFunds) {
        alertedNoFunds = true;
        await step.run("alert-no-funds", () => alert(noFunds).then(() => null));
      }
      await step.sleep(`wait-${attempt}`, ORACLE_SETTINGS.busyPoll);
      continue;
    }

    let tx = sent.tx;
    for (let poll = 1; ; poll++) {
      await step.sleep(`receipt-wait-${attempt}-${poll}`, ORACLE_SETTINGS.receiptPoll);
      const checked = await step.run(`receipt-${attempt}-${poll}`, () =>
        receiptStep(tx, input, data, chain, logger),
      );
      if (checked.kind === "mined") return settledBy(input.action);
      overBudget(checked.at);
      if (checked.kind === "again") break;
      tx = checked.tx;
      if (tx.atCap && !alertedFeeCap) {
        alertedFeeCap = true;
        const text = feeCapText(input, tx);
        await step.run("alert-fee-cap", () => alert(text).then(() => null));
      }
    }
  }
}

async function sendStep(
  input: OracleInput,
  data: Hex,
  chain: OracleChain,
  logger: OracleLogger,
): Promise<SendStep> {
  const at = chain.now();
  const nonces = await chain.nonces();
  if (!nonces.ok) return { kind: "again", at };
  if (nonces.pending > nonces.latest) return { kind: "busy", at };

  const contract = input.contract as Hex;
  const read = await chain.readRequest(contract, input.requestId);
  const oracle = await chain.readOracle(contract);
  if (!read.ok || !oracle.ok) return { kind: "again", at };
  if (oracle.oracle !== chain.account)
    return { kind: "done", at, result: { state: "not-our-oracle" } };

  const { request } = read;
  const { action } = input;
  switch (request.status) {
    case "none":
      return { kind: "done", at, result: { state: "unknown" } };
    case "cancelled":
      return {
        kind: "done",
        at,
        result: {
          state: "cancelled",
          reason: request.cancelReason === "invalid-target" ? "invalid-target" : "expired",
        },
      };
    case "fulfilled":
      if (action.kind === "fulfil" && request.rKaUal !== action.rKaUal) {
        return { kind: "conflict", at, rKaUal: request.rKaUal };
      }
      return {
        kind: "done",
        at,
        result: { state: "fulfilled", score: request.score, rKaUal: request.rKaUal },
      };
    case "pending":
      break;
  }

  const estimate = await chain.estimateFees();
  if (!estimate.ok) return { kind: "again", at };
  const fees = capped(estimate.fees);
  const sent = await chain.send({ to: input.contract, data, nonce: nonces.latest, fees });
  if (sent.ok) {
    return {
      kind: "sent",
      at,
      tx: {
        nonce: nonces.latest,
        hashes: [sent.hash],
        maxFeePerGas: String(fees.maxFeePerGas),
        maxPriorityFeePerGas: String(fees.maxPriorityFeePerGas),
        sentAt: at,
        atCap: false,
      },
    };
  }
  if (sent.reason === "in-flight") return { kind: "busy", at };
  if (sent.reason === "no-funds") {
    const noFunds = `oracle-no-funds: ${chain.account} cannot pay for request ${input.requestId}`;
    logger.error(noFunds);
    return { kind: "again", at, noFunds };
  }
  return { kind: "again", at };
}

async function receiptStep(
  tx: SentTx,
  input: OracleInput,
  data: Hex,
  chain: OracleChain,
  logger: OracleLogger,
): Promise<ReceiptStep> {
  const at = chain.now();
  // Every hash sent shares one nonce, so at most one is ever mined; they are read at once.
  const receipts = await Promise.all(tx.hashes.map((hash) => chain.receipt(hash)));
  const mined = receipts.find((receipt) => receipt.ok && receipt.state !== "none");
  if (mined?.ok) return mined.state === "success" ? { kind: "mined", at } : { kind: "again", at };
  if (receipts.some((receipt) => !receipt.ok)) return { kind: "pending", at, tx };
  const nonces = await chain.nonces();
  if (!nonces.ok) return { kind: "pending", at, tx };
  if (nonces.latest > tx.nonce) return { kind: "again", at };
  if (at - tx.sentAt < ORACLE_SETTINGS.bumpAfterMs) return { kind: "pending", at, tx };

  const fees = raised({
    maxFeePerGas: BigInt(tx.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas),
  });
  if (fees.maxFeePerGas > ORACLE_SETTINGS.feeCapWei) {
    if (!tx.atCap) logger.error(feeCapText(input, tx));
    return { kind: "pending", at, tx: { ...tx, atCap: true } };
  }
  const sent = await chain.send({ to: input.contract, data, nonce: tx.nonce, fees });
  if (!sent.ok)
    return sent.reason === "reverted" ? { kind: "again", at } : { kind: "pending", at, tx };
  return {
    kind: "pending",
    at,
    tx: {
      ...tx,
      hashes: [...tx.hashes, sent.hash],
      maxFeePerGas: String(fees.maxFeePerGas),
      maxPriorityFeePerGas: String(fees.maxPriorityFeePerGas),
      sentAt: at,
    },
  };
}

/** Replaces a nonce held too long with a zero-value transfer to itself, above any lane fee. */
async function unstick(chain: OracleChain): Promise<{ at: number }> {
  const at = chain.now();
  const nonces = await chain.nonces();
  if (nonces.ok && nonces.pending > nonces.latest) {
    const fee = raise(ORACLE_SETTINGS.feeCapWei);
    await chain.send({
      to: chain.account,
      data: "0x",
      nonce: nonces.latest,
      fees: { maxFeePerGas: fee, maxPriorityFeePerGas: fee },
    });
  }
  return { at };
}

function settledBy(action: OracleAction): OracleResult {
  return action.kind === "fulfil"
    ? { state: "fulfilled", score: action.score, rKaUal: action.rKaUal }
    : { state: "cancelled", reason: action.reason };
}

function capped(fees: Fees): Fees {
  const cap = ORACLE_SETTINGS.feeCapWei;
  const maxFeePerGas = fees.maxFeePerGas < cap ? fees.maxFeePerGas : cap;
  const maxPriorityFeePerGas =
    fees.maxPriorityFeePerGas < maxFeePerGas ? fees.maxPriorityFeePerGas : maxFeePerGas;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

function raised(fees: Fees): Fees {
  return {
    maxFeePerGas: raise(fees.maxFeePerGas),
    maxPriorityFeePerGas: raise(fees.maxPriorityFeePerGas),
  };
}

/** `value` raised by `bumpPercent`, rounded up. */
function raise(value: bigint): bigint {
  return (value * (100n + ORACLE_SETTINGS.bumpPercent) + 99n) / 100n;
}

/**
 * The `oracle-transaction` Inngest function. A rating run invokes it with `step.invoke`; no
 * event starts it. It runs one step at a time (concurrency 1: one deployment holds one oracle
 * key), with `finishTimeout`. `getChain` builds the chain on the first run, so importing the
 * function validates no settings.
 */
export function createOracleTransaction(
  inngest: Inngest.Any,
  getChain: () => OracleChain,
  alert: (message: string) => Promise<void>,
) {
  return inngest.createFunction(
    {
      id: "oracle-transaction",
      concurrency: { limit: 1 },
      timeouts: { finish: ORACLE_SETTINGS.finishTimeout },
    },
    async ({ event, step, logger }) =>
      runOracle(
        parseOracleInput(event.data),
        {
          run: (id, fn) => step.run(id, fn) as never,
          sleep: (id, duration) => step.sleep(id, duration),
        },
        loadChain(getChain),
        logger,
        alert,
      ),
  );
}

/** The `oracle-at-fee-cap` line, logged and alerted on: every rating waits on this nonce. */
function feeCapText(input: OracleInput, tx: SentTx): string {
  return `oracle-at-fee-cap: request ${input.requestId} unmined at nonce ${tx.nonce}; every rating waits on it`;
}

/** The chain from `getChain`; missing or invalid settings stop the run (`setup`). */
function loadChain(getChain: () => OracleChain): OracleChain {
  try {
    return getChain();
  } catch (error) {
    throw stop(
      "setup",
      `oracle settings: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}
