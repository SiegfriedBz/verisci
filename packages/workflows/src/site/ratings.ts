import {
  type CancelReason,
  type ReadRequestIdsResult,
  type ReadRequestResult,
  readRatingRequest,
  readRequestIdsOf,
} from "@labstrail/contracts";
import { parseRating, type RatingRecord, ratingQuery, rKaName } from "@labstrail/core";
import { createDkgClient, type DkgClient } from "@labstrail/dkg";
import { defineEnv, sharedEnv } from "@labstrail/env";
import type { Hex } from "viem";
import { anvil, baseSepolia } from "viem/chains";
import { inngest } from "../inngest.ts";
import { environmentContracts } from "../rating/contracts.ts";
import { type ContractLog, ratingRequestedEvent } from "../rating/events.ts";
import { localChainSchema } from "../rating-env.ts";
import { createWorkflowsEnv } from "../workflows-env.ts";
import { createSiteChainClient } from "./chain.ts";
import { queryProblem } from "./papers.ts";

/**
 * How long the chain gets for one paper's ratings in the papers list: three rounds of reads one
 * after the other (the counts, the ids, the requests), each round shared with the page's other
 * papers (`createSiteChainClient`), and one quick retry, such as after a 429. A first try that
 * runs out its 5 s leaves no time for the retry, and the paper is `unknown`.
 */
const SUMMARY_TIMEOUT_MS = 6_000;
/** How long the DKG node gets for one read of a page. */
const PAGE_TIMEOUT_MS = 15_000;

/** One rating request of a paper, as its contract holds it. */
export interface RatingSummary {
  /** The phase-1 request id, `0x` + 64 lowercase hex. */
  readonly requestId: string;
  /** The contract that took the request, lowercase. */
  readonly contract: string;
  readonly status: "pending" | "fulfilled" | "cancelled";
  /** Why it was cancelled; set only when cancelled. */
  readonly cancelReason?: Exclude<CancelReason, "none">;
  /** The phase-1 score the contract recorded; set only when fulfilled. */
  readonly score?: number;
  /** The R-KA's UAL; set only when fulfilled. */
  readonly rKaUal?: string;
  /** The request's block timestamp, in Unix seconds. */
  readonly requestedAt: number;
}

/** The result of `listRatings`. */
export type RatingListResult =
  | { readonly ok: true; readonly ratings: readonly RatingSummary[] }
  | { readonly ok: false; readonly reason: "unavailable" };

/**
 * A paper's rating, as the papers list and the paper page show it ({@link summariseRatings}):
 * the latest fulfilled score; `pending` when none is fulfilled and one is pending;
 * `cannot-rate` when a request was cancelled `invalid-target`; `unrated` otherwise; `unknown`
 * when the chain did not answer in 6 s.
 */
export type PaperRatingSummary =
  | { readonly kind: "scored"; readonly score: number; readonly requestId: string }
  | { readonly kind: "pending" }
  | { readonly kind: "cannot-rate" }
  | { readonly kind: "unrated" }
  | { readonly kind: "unknown" };

/**
 * Where a pending rating stands, read from its R-KA on the node: being scored (no asset yet),
 * saved (a draft), minting (stored, the mint started), or minted and waiting for the oracle to
 * record it on chain; `unknown` when the node did not answer.
 */
export type RatingStage = "scoring" | "saving" | "minting" | "recording" | "unknown";

/** The result of `readRating`. */
export type RatingView =
  | { readonly ok: false; readonly reason: "not-found" | "unavailable" }
  | {
      readonly ok: true;
      readonly rating: RatingSummary & { readonly targetUal: string };
      /** Set only while pending. */
      readonly stage?: RatingStage;
      /** The R-KA's content, once fulfilled and readable. */
      readonly record?: RatingRecord;
      /** True when the R-KA's score differs from the contract's, which is the one shown (ADR 0014). */
      readonly gap?: boolean;
      /** Why a fulfilled rating's R-KA cannot be shown (ADR 0021). */
      readonly recordProblem?: "unavailable" | "unreadable";
    };

/** The result of `announceLocalRating`. */
export type AnnounceResult =
  | { readonly ok: true; readonly requestId: string }
  | { readonly ok: false; readonly reason: "not-local" | "no-request" | "unavailable" };

/** What the pages call to show and request ratings. */
export interface RatingService {
  /** Every rating of `targetUal` on this environment's contracts, oldest first. */
  listRatings(targetUal: string): Promise<RatingListResult>;
  /** Each paper's rating summary, in the order of `targetUals`; never more than 6 s per paper. */
  paperRatingSummaries(targetUals: readonly string[]): Promise<readonly PaperRatingSummary[]>;
  /** One rating by its request id: its request, its stage while pending, its R-KA once fulfilled. */
  readRating(requestId: string): Promise<RatingView>;
  /**
   * Locally only, stands in for the Alchemy Notify webhook (ADR 0036): reads the transaction's
   * receipt on Anvil and sends the event of the request it holds, once (ADR 0017). Anvil or
   * Inngest not answering is `unavailable`, logged as `rating-announce-unavailable: anvil: …`
   * or `…: inngest: …`.
   */
  announceLocalRating(txHash: Hex): Promise<AnnounceResult>;
}

/** The IO {@link createRatingService} uses; tests pass fakes. */
export interface RatingIo {
  /** The environment's contracts, lowercase: the Anvil one locally. */
  readonly contracts: readonly string[];
  /** True when `APP_ENV=local`. */
  readonly local: boolean;
  readonly contextGraph: string;
  readRequestIds(contract: Hex, targetUal: string): Promise<ReadRequestIdsResult>;
  readRequest(contract: Hex, requestId: Hex): Promise<ReadRequestResult>;
  readAsset: DkgClient["readAsset"];
  query: DkgClient["query"];
  /** The logs of a mined transaction, or why they cannot be read. */
  readReceiptLogs(txHash: Hex): Promise<readonly ContractLog[] | "unreachable">;
  /** Sends one event to Inngest. */
  send(event: { name: string; id: string; data: Record<string, string> }): Promise<void>;
  readonly logger: { warn(message: string): void };
}

/** Builds the rating pages' calls from their IO. */
export function createRatingService(io: RatingIo): RatingService {
  async function listRatings(targetUal: string): Promise<RatingListResult> {
    const perContract = await Promise.all(
      io.contracts.map(async (contract) => {
        const ids = await io.readRequestIds(contract as Hex, targetUal);
        if (!ids.ok) return undefined;
        const reads = await Promise.all(
          ids.ids.map((requestId) => io.readRequest(contract as Hex, requestId)),
        );
        const ratings: RatingSummary[] = [];
        for (const [index, read] of reads.entries()) {
          if (!read.ok) return undefined;
          if (read.request.status === "none") continue;
          ratings.push(summaryOf(String(ids.ids[index]).toLowerCase(), contract, read.request));
        }
        return ratings;
      }),
    );
    if (perContract.some((ratings) => ratings === undefined)) {
      return { ok: false, reason: "unavailable" };
    }
    const ratings = perContract
      .flatMap((list) => list ?? [])
      .sort((a, b) => a.requestedAt - b.requestedAt);
    return { ok: true, ratings };
  }

  return {
    listRatings,

    paperRatingSummaries: (targetUals) =>
      Promise.all(
        targetUals.map(async (ual): Promise<PaperRatingSummary> => {
          const list = await within(SUMMARY_TIMEOUT_MS, listRatings(ual));
          return list === "late" || !list.ok ? { kind: "unknown" } : summariseRatings(list.ratings);
        }),
      ),

    readRating: async (requestId) => {
      const id = requestId.toLowerCase() as Hex;
      let unreachable = false;
      // Every contract at once, then in the environment's order, current first.
      const reads = await Promise.all(
        io.contracts.map((contract) => io.readRequest(contract as Hex, id)),
      );
      for (const [index, read] of reads.entries()) {
        const contract = io.contracts[index] as string;
        if (!read.ok) {
          unreachable = true;
          continue;
        }
        if (read.request.status === "none") continue;
        const rating = {
          ...summaryOf(id, contract, read.request),
          targetUal: read.request.targetUal,
        };
        if (rating.status === "pending") return { ok: true, rating, stage: await stageOf(id) };
        if (rating.status === "cancelled" || rating.rKaUal === undefined)
          return { ok: true, rating };
        return { ok: true, rating, ...(await recordOf(rating.rKaUal, rating.score ?? 0)) };
      }
      return { ok: false, reason: unreachable ? "unavailable" : "not-found" };
    },

    announceLocalRating: async (txHash) => {
      if (!io.local) return { ok: false, reason: "not-local" };
      const logs = await io.readReceiptLogs(txHash);
      if (logs === "unreachable") {
        io.logger.warn(`rating-announce-unavailable: anvil: no receipt for ${txHash}`);
        return { ok: false, reason: "unavailable" };
      }
      const event = logs
        .filter((log) => io.contracts.includes(log.address.toLowerCase()))
        .map((log) => ratingRequestedEvent(log))
        .find((found) => found !== undefined);
      if (!event) return { ok: false, reason: "no-request" };
      try {
        await io.send({ name: event.name, id: event.id, data: { ...event.data } });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        io.logger.warn(`rating-announce-unavailable: inngest: ${detail}`);
        return { ok: false, reason: "unavailable" };
      }
      return { ok: true, requestId: event.data.requestId };
    },
  };

  /** Where a pending rating stands, from its R-KA's state on the node. */
  async function stageOf(requestId: string): Promise<RatingStage> {
    const name = rKaName(requestId);
    if (!name.ok) return "unknown";
    const asset = await io.readAsset(name.name);
    if (!asset.ok) return "unknown";
    switch (asset.state) {
      case "missing":
        return "scoring";
      case "draft":
        return "saving";
      case "stored":
        return "minting";
      case "minted":
        return "recording";
    }
  }

  /** A fulfilled rating's R-KA content, and whether its score matches the contract's. */
  async function recordOf(
    rKaUal: string,
    score: number,
  ): Promise<
    | { readonly record: RatingRecord; readonly gap: boolean }
    | { readonly recordProblem: "unavailable" | "unreadable" }
  > {
    const sparql = ratingQuery(io.contextGraph, rKaUal);
    if (!sparql) return { recordProblem: "unreadable" };
    const rows = await io.query(sparql);
    if (!rows.ok) return { recordProblem: queryProblem(rows) };
    const record = parseRating(rows.bindings);
    if (!record) return { recordProblem: "unreadable" };
    return { record, gap: record.score !== score };
  }
}

function summaryOf(
  requestId: string,
  contract: string,
  request: Extract<ReadRequestResult, { ok: true }>["request"],
): RatingSummary {
  const base = { requestId, contract, requestedAt: request.requestedAt };
  if (request.status === "fulfilled") {
    return { ...base, status: "fulfilled", score: request.score, rKaUal: request.rKaUal };
  }
  if (request.status === "cancelled" && request.cancelReason !== "none") {
    return { ...base, status: "cancelled", cancelReason: request.cancelReason };
  }
  return { ...base, status: "pending" };
}

/**
 * A paper's ratings, oldest first, summed up as one {@link PaperRatingSummary}, any kind but
 * `unknown`: the rule the papers list and the paper page share, so they agree.
 */
export function summariseRatings(
  ratings: readonly RatingSummary[],
): Exclude<PaperRatingSummary, { kind: "unknown" }> {
  const scored = ratings.filter((rating) => rating.status === "fulfilled").at(-1);
  if (scored) return { kind: "scored", score: scored.score ?? 0, requestId: scored.requestId };
  if (ratings.some((rating) => rating.status === "pending")) return { kind: "pending" };
  return ratings.some((rating) => rating.cancelReason === "invalid-target")
    ? { kind: "cannot-rate" }
    : { kind: "unrated" };
}

/** What `work` answers, or `late` when it takes more than `ms`. */
async function within<T>(ms: number, work: Promise<T>): Promise<T | "late"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

let service: RatingService | undefined;

/**
 * The rating pages' calls, built on first use from `process.env` (they throw `EnvError` when a
 * setting is bad). Deployed, they read every contract of the environment on Base Sepolia;
 * locally (`APP_ENV=local`), the Anvil contract on `LOCAL_CHAIN_RPC_URL` (ADR 0036). Reading
 * needs no oracle key.
 */
export function getRatingService(): RatingService {
  if (service) return service;
  const env = createWorkflowsEnv();
  const local = env.APP_ENV === "local";
  const localChain = local
    ? defineEnv({ extends: [sharedEnv], server: localChainSchema, runtimeEnv: process.env })
    : undefined;
  const client = createSiteChainClient(
    local ? anvil : baseSepolia,
    localChain ? localChain.LOCAL_CHAIN_RPC_URL : env.CHAIN_RPC_URL,
  );
  const dkg = createDkgClient({
    url: env.DKG_URL,
    token: env.DKG_TOKEN,
    contextGraphId: env.DKG_CONTEXT_GRAPH,
    timeoutMs: PAGE_TIMEOUT_MS,
  });
  service = createRatingService({
    contracts: environmentContracts(env.APP_ENV, localChain?.LOCAL_RATING_CONTRACT),
    local,
    contextGraph: env.DKG_CONTEXT_GRAPH,
    // Base's OP-stack formatters type its client apart from viem's default `PublicClient`.
    readRequestIds: (contract, ual) => readRequestIdsOf(client as never, contract, ual),
    readRequest: (contract, requestId) => readRatingRequest(client as never, contract, requestId),
    readAsset: (name) => dkg.readAsset(name),
    query: (sparql) => dkg.query(sparql),
    readReceiptLogs: async (hash) => {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        return receipt.logs;
      } catch {
        return "unreachable";
      }
    },
    send: async (event) => {
      await inngest.send({ id: event.id, name: event.name, data: event.data });
    },
    logger: console,
  });
  return service;
}
