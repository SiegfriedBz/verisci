import { readPendingCount, readPendingRequestIds } from "@labstrail/contracts";
import { ORIGINTRAIL_CONTRACTS } from "@labstrail/core";
import { createDkgClient } from "@labstrail/dkg";
import { defineEnv, type RuntimeEnv, sharedEnv } from "@labstrail/env";
import { createPublicClient, createWalletClient, erc20Abi, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil, baseSepolia } from "viem/chains";
import { createHealthCheck, HEALTH_SETTINGS, type HealthDeps } from "./alerts/health.ts";
import { siteUrlOf } from "./alerts/messages.ts";
import { createNotify, type Notify } from "./alerts/notify.ts";
import { createFailureAlerts } from "./alerts/on-failure.ts";
import { inngest } from "./inngest.ts";
import { readPaperText } from "./pdf/paper-text.ts";
import { checkField } from "./publish/field-check.ts";
import { createPublishPaper, PUBLISH_SETTINGS, type PublishDeps } from "./publish/publish-paper.ts";
import { type ReadPaperOptions, readPaper } from "./publish/read-paper.ts";
import { verifySubmission } from "./publish/verify-submission.ts";
import { environmentContracts } from "./rating/contracts.ts";
import { createOracleTransaction, ORACLE_SETTINGS, type OracleChain } from "./rating/oracle.ts";
import { createOracleChain } from "./rating/oracle-chain.ts";
import { createRatePaper, RATING_SETTINGS, type RatingDeps } from "./rating/rate-paper.ts";
import { createReconciler, type ReconcilerDeps } from "./rating/reconciler.ts";
import { scorePaper } from "./rating/scorer.ts";
import { createRatingEnv, type RatingEnv, servesRating } from "./rating-env.ts";
import { createWorkflowsEnv, telegramSchema, type WorkflowsEnv } from "./workflows-env.ts";

/** How long the gateway and GROBID each get, inside the 300 s a step may take on Vercel. */
const IO_TIMEOUT_MS = 60_000;

/** How long Telegram gets to take a message. */
const NOTIFY_TIMEOUT_MS = 10_000;

let notify: Notify | undefined;

/**
 * The maintainer's Telegram chat (ADR 0038), built on first use from the Telegram settings
 * alone, so an alert still goes out when another setting is bad. They are optional here, even
 * on production, where the start check requires them: without a bot, an alert is logged rather
 * than lost.
 */
function getNotify(): Notify {
  if (notify) return notify;
  const env = defineEnv({
    extends: [sharedEnv],
    server: telegramSchema(false),
    runtimeEnv: process.env,
  });
  notify = createNotify({
    appEnv: env.APP_ENV,
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
    fetch: (url, init) => fetch(url, init),
    timeoutMs: NOTIFY_TIMEOUT_MS,
    logger: console,
  });
  return notify;
}

/**
 * How the publish run reads a paper: the PDF through the gateway, its header through GROBID
 * with the environment's credential for the node server (ADR 0039).
 */
export function paperReaderOptions(
  env: Pick<WorkflowsEnv, "PINATA_GATEWAY_URL" | "GROBID_URL" | "DKG_TOKEN">,
): ReadPaperOptions {
  return {
    gatewayUrl: env.PINATA_GATEWAY_URL,
    grobidUrl: env.GROBID_URL,
    token: env.DKG_TOKEN,
    fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
    maxBytes: PUBLISH_SETTINGS.maxPdfBytes,
    timeoutMs: IO_TIMEOUT_MS,
    openingChars: PUBLISH_SETTINGS.openingChars,
  };
}

let publishDeps: PublishDeps | undefined;

/** The publish run's adapters, built from the validated settings on the first run. */
function getPublishDeps(): PublishDeps {
  if (publishDeps) return publishDeps;
  const env = createWorkflowsEnv();
  const client = createPublicClient({ chain: baseSepolia, transport: http(env.CHAIN_RPC_URL) });
  const paperOptions = paperReaderOptions(env);
  publishDeps = {
    verifySubmission: (data, receivedAt) =>
      verifySubmission(data, {
        contextGraph: env.DKG_CONTEXT_GRAPH,
        client,
        now: () => receivedAt,
      }),
    readPaper: (cid) => readPaper(cid, paperOptions),
    checkField: (paper) =>
      checkField(paper, {
        apiKey: env.GEMINI_API_KEY,
        model: PUBLISH_SETTINGS.fieldModel,
        fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
        timeoutMs: PUBLISH_SETTINGS.fieldTimeoutMs,
      }),
    dkg: createDkgClient({
      url: env.DKG_URL,
      token: env.DKG_TOKEN,
      contextGraphId: env.DKG_CONTEXT_GRAPH,
    }),
    notify: getNotify(),
    siteUrl: siteUrlOf(env),
  };
  return publishDeps;
}

interface RatingChain {
  readonly env: RatingEnv;
  readonly chain: OracleChain;
  /** The reads the reconciler and the health check make on the same chain. */
  readonly pending: Pick<ReconcilerDeps, "readPendingCount" | "readPendingIds">;
  /** An address's ETH on the rating chain, `undefined` when it does not answer. */
  readEth(address: string): Promise<bigint | undefined>;
  readonly chainId: number;
  /** The environment's contracts, lowercase. */
  readonly contracts: readonly string[];
}

let ratingChain: RatingChain | undefined;

/**
 * The rating settings and the oracle's chain, built once. Locally the contract is the one
 * deployed on Anvil (ADR 0036); elsewhere every contract of the environment, current and past,
 * on Base Sepolia (ADRs 0023, 0028).
 */
function getRatingChain(): RatingChain {
  if (ratingChain) return ratingChain;
  const env = createRatingEnv();
  const local = env.APP_ENV === "local";
  const chain = local ? anvil : baseSepolia;
  // One try per call, so a call ends within its timeout: the steps poll and retry.
  const transport = http(local ? env.LOCAL_CHAIN_RPC_URL : env.CHAIN_RPC_URL, {
    timeout: ORACLE_SETTINGS.rpcTimeoutMs,
    retryCount: 0,
  });
  const account = privateKeyToAccount(env.ORACLE_PRIVATE_KEY as Hex);
  const client = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account, chain, transport });
  ratingChain = {
    env,
    // Base's OP-stack formatters type its client apart from viem's default `PublicClient`;
    // the reads the oracle makes (nonces, fees, receipts, contract calls) are the same.
    chain: createOracleChain({ client: client as never, wallet, account }),
    pending: {
      readPendingCount: (contract) => readPendingCount(client as never, contract),
      readPendingIds: (contract, offset, limit) =>
        readPendingRequestIds(client as never, contract, offset, limit),
    },
    readEth: (address) => client.getBalance({ address: address as Hex }).catch(() => undefined),
    chainId: chain.id,
    contracts: environmentContracts(env.APP_ENV, env.LOCAL_RATING_CONTRACT),
  };
  return ratingChain;
}

let ratingDeps: RatingDeps | undefined;

/** The rating run's adapters, built from the validated settings on the first run. */
function getRatingDeps(): RatingDeps {
  if (ratingDeps) return ratingDeps;
  const { env, chain, chainId, contracts } = getRatingChain();
  ratingDeps = {
    contracts,
    oracle: chain.account,
    contextGraph: env.DKG_CONTEXT_GRAPH,
    chainId,
    now: () => Date.now(),
    readRequest: chain.readRequest,
    readOracle: chain.readOracle,
    dkg: createDkgClient({
      url: env.DKG_URL,
      token: env.DKG_TOKEN,
      contextGraphId: env.DKG_CONTEXT_GRAPH,
    }),
    readPaper: (cid) =>
      readPaperText(cid, {
        gatewayUrl: env.PINATA_GATEWAY_URL,
        fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
        maxBytes: RATING_SETTINGS.maxPdfBytes,
        timeoutMs: RATING_SETTINGS.pdfTimeoutMs,
        maxChars: RATING_SETTINGS.maxTextChars,
      }),
    score: (paper) =>
      scorePaper(paper, {
        apiKey: env.GEMINI_API_KEY,
        model: RATING_SETTINGS.model,
        fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
        timeoutMs: RATING_SETTINGS.scorerTimeoutMs,
      }),
    checkField: (paper) =>
      checkField(paper, {
        apiKey: env.GEMINI_API_KEY,
        model: PUBLISH_SETTINGS.fieldModel,
        fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
        timeoutMs: PUBLISH_SETTINGS.fieldTimeoutMs,
      }),
    notify: getNotify(),
    siteUrl: siteUrlOf(env),
  };
  return ratingDeps;
}

/** Publishes a submitted PDF as a Target KA (`labstrail/paper.submitted`). */
export const publishPaper = createPublishPaper(inngest, getPublishDeps);

/** Sends the oracle's fulfil and cancel transactions, one at a time (ADR 0019). */
export const oracleTransaction = createOracleTransaction(
  inngest,
  () => getRatingChain().chain,
  (text) => alertMaintainer(text),
);

/** Rates a requested paper and has the oracle record it (`labstrail/rating.requested`). */
export const ratePaper = createRatePaper(inngest, getRatingDeps, oracleTransaction, {
  throttle: sharedEnv.APP_ENV !== "local",
});

/**
 * Alerts the maintainer on Telegram (ADR 0038), from the Telegram settings alone, so a run
 * that failed on another bad setting is still alerted on.
 */
export const alertMaintainer = (text: string) => getNotify()({ level: "alert", text });

/** Alerts on every function's failure (ADR 0038). */
export const failureAlerts = createFailureAlerts(inngest, alertMaintainer);

let healthDeps: HealthDeps | undefined;

/**
 * The health check's reads: the DKG node's open status, the oracle's ETH on the rating chain,
 * and the node's publisher wallets' ETH and TRAC on Base Sepolia, where the node publishes,
 * locally too.
 */
function getHealthDeps(): HealthDeps {
  if (healthDeps) return healthDeps;
  const { env, chain, pending, contracts, readEth } = getRatingChain();
  const base = createPublicClient({
    chain: baseSepolia,
    transport: http(env.CHAIN_RPC_URL, { timeout: ORACLE_SETTINGS.rpcTimeoutMs, retryCount: 0 }),
  });
  const trac = ORIGINTRAIL_CONTRACTS[baseSepolia.id]?.trac;
  const dkg = createDkgClient({
    url: env.DKG_URL,
    token: env.DKG_TOKEN,
    contextGraphId: env.DKG_CONTEXT_GRAPH,
    timeoutMs: HEALTH_SETTINGS.nodeTimeoutMs,
  });
  healthDeps = {
    node: env.DKG_URL,
    graph: env.DKG_CONTEXT_GRAPH,
    readNodeStatus: () => dkg.readStatus(),
    oracle: chain.account,
    publishers: env.PUBLISHER_ADDRESSES,
    contracts,
    ...pending,
    readRequest: chain.readRequest,
    readEth: (address) =>
      address === chain.account
        ? readEth(address)
        : base.getBalance({ address: address as Hex }).catch(() => undefined),
    readTrac: (address) =>
      trac
        ? base
            .readContract({
              address: trac,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address as Hex],
            })
            .catch(() => undefined)
        : Promise.resolve(undefined),
    logger: console,
  };
  return healthDeps;
}

/** Checks the DKG node, wallet balances and old pending requests every hour (ADR 0038). */
export const healthCheck = createHealthCheck(inngest, getHealthDeps, alertMaintainer);

/**
 * Restarts requests pending past the threshold, every 30 minutes (ADR 0020), on the rating
 * chain's contracts: the environment's, or Anvil's locally (ADR 0036).
 */
export const reconcileRatings = createReconciler(inngest, () => {
  const { chain, pending, contracts } = getRatingChain();
  return { contracts, ...pending, readRequest: chain.readRequest, logger: console };
});

/**
 * The functions a deployment serves: the publish function and the failure alerts, plus the
 * rating, oracle, reconciler and health functions where the oracle key is set (ADRs 0019,
 * 0020, 0038). Reads the key's presence only.
 */
export function servedFunctions(runtimeEnv: RuntimeEnv = process.env) {
  const always = [publishPaper, failureAlerts];
  return servesRating(runtimeEnv)
    ? [...always, ratePaper, oracleTransaction, reconcileRatings, healthCheck]
    : always;
}

/** Every Inngest function this deployment serves, for `web`'s `/api/inngest` route (ADR 0003). */
export const functions = servedFunctions();
