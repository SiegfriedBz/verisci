import type { NodeStatus } from "@labstrail/dkg";
import type { Inngest } from "inngest";
import { formatEther, type Hex } from "viem";
import { type PendingReads, readPending } from "../rating/pending.ts";

/** The hourly health check's settings and thresholds (ADRs 0015, 0019, 0038). */
export const HEALTH_SETTINGS = {
  /** Every hour: about 720 runs a month, against Inngest's free 50,000 executions. */
  cron: "0 * * * *",
  /**
   * Below this, a wallet is alerted on: 0.005 ETH is hundreds of oracle transactions or
   * publishes on Base Sepolia, a few days' warning.
   */
  minEthWei: 5n * 10n ** 15n,
  /** Below this, a publisher wallet is alerted on: 100 TRAC. */
  minTracWei: 100n * 10n ** 18n,
  /**
   * A request pending longer is alerted on: past the reconciler's 4-hour threshold and its
   * interval, it should have been restarted and settled.
   */
  oldestPendingMs: 6 * 3_600_000,
  /** How long the node's health check may take before the node counts as not answering. */
  nodeTimeoutMs: 10_000,
  /** Pending ids read per call. */
  pageSize: 100,
  /**
   * Pages of pending ids read per contract an hour, each hour going on from the last: all of
   * them up to 200 pending requests, and past that a spam backlog in turns. With one count, 2
   * pages and 20 batches of 10 requests (`readPending`), a contract's step ends within Vercel's
   * 300 s even when every call waits out the RPC's 10 s timeout.
   */
  pagesPerHour: 2,
} as const;

/** The reads the health check makes; tests pass fakes. */
export interface HealthDeps extends PendingReads {
  /** The DKG node's base URL, named in its alert (`DKG_URL`). */
  readonly node: string;
  /** The environment's context graph id (`DKG_CONTEXT_GRAPH`), named in its alert. */
  readonly graph: string;
  /** The node's open health check, with the environment's graph as it lists it. */
  readNodeStatus(): Promise<NodeStatus>;
  /** The oracle's address, lowercase (ADR 0019). */
  readonly oracle: string;
  /** The DKG node's publisher wallets, lowercase. */
  readonly publishers: readonly string[];
  /** The environment's contracts, lowercase. */
  readonly contracts: readonly string[];
  /** An address's ETH in wei, `undefined` when the chain did not answer. */
  readEth(address: string): Promise<bigint | undefined>;
  /** An address's TRAC in its smallest unit, `undefined` when the chain did not answer. */
  readTrac(address: string): Promise<bigint | undefined>;
  readonly logger: { warn(message: string): void };
}

/** The step tool a health check uses; tests pass a fake. */
export interface HealthSteps {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

/** A request pending past `oldestPendingMs`, with how long it has been pending. */
interface OldRequest {
  readonly contract: string;
  readonly requestId: Hex;
  readonly ageMs: number;
}

/** What one contract's check found: its old requests, and how many it read of how many pending. */
interface ContractPending {
  readonly old: OldRequest[];
  readonly read: number;
  readonly count: number;
}

/**
 * One health check (ADR 0038): reads the DKG node's status in a step (`check-node`), then the
 * balances in a step (`check-balances`), then each
 * contract's pending requests in a step of its own (`check-pending-<contract>`), one after the
 * other, reading the time inside it, and sends what needs the maintainer as one alert from
 * another step (`alert`), only when there is something. The lines: the node not answering, or
 * the environment's graph not listed or not `accepted` from `finalized-chain`; the oracle or a publisher
 * wallet under its ETH threshold, a publisher wallet under its TRAC threshold, and requests
 * pending past `oldestPendingMs` (how many, the oldest, and how many were read when a backlog
 * is read in turns). A balance that does not answer is logged `health-unreadable` and read
 * again the next hour; a contract that does not answer is logged `health-unreachable`, and
 * requests that do not answer `health-unreadable` with their number.
 */
export async function runHealthCheck(
  step: HealthSteps,
  getDeps: () => HealthDeps,
  alert: (text: string) => Promise<void>,
  now: () => number,
): Promise<{ readonly problems: string[] }> {
  const deps = getDeps();
  const problems = await step.run("check-node", () => nodeProblems(deps));
  problems.push(...(await step.run("check-balances", () => balanceProblems(deps))));
  const found: ContractPending[] = [];
  for (const contract of deps.contracts) {
    found.push(
      await step.run(`check-pending-${contract}`, () => contractPending(deps, contract, now())),
    );
  }
  problems.push(...pendingProblem(found));
  if (problems.length > 0) {
    await step.run("alert", () => alert(problems.join("\n")).then(() => null));
  }
  return { problems };
}

/**
 * The node's problem, if any: it does not answer (or answers with an error), or the
 * environment's graph is not listed, or not accepted from finalized blocks, so writes to it
 * may fail while the node still answers (`docs/domain.md` → DKG).
 */
async function nodeProblems(deps: HealthDeps): Promise<string[]> {
  const status = await deps.readNodeStatus();
  if (!status.ok) {
    const reason =
      status.status === undefined ? status.reason : `${status.reason} (${status.status})`;
    return [`DKG node ${deps.node}: status check failed, ${reason}`];
  }
  if (status.graph === undefined) return [`DKG node: ${deps.graph} is not listed`];
  const { authorityState, policySource } = status.graph;
  if (authorityState === "accepted" && policySource === "finalized-chain") return [];
  return [`DKG node: ${deps.graph} is ${authorityState}/${policySource}`];
}

/** The oracle's and the publisher wallets' balances under their thresholds, one line each. */
async function balanceProblems(deps: HealthDeps): Promise<string[]> {
  const { minEthWei, minTracWei } = HEALTH_SETTINGS;
  const wallets = [
    { role: "oracle", address: deps.oracle, trac: false },
    ...deps.publishers.map((address) => ({ role: "publisher", address, trac: true })),
  ];
  const problems: string[] = [];
  for (const { role, address, trac } of wallets) {
    const [eth, tracWei] = await Promise.all([
      deps.readEth(address),
      trac ? deps.readTrac(address) : Promise.resolve(0n),
    ]);
    if (eth === undefined) deps.logger.warn(`health-unreadable: ${role} ${address}: ETH`);
    else if (eth < minEthWei) {
      problems.push(
        `${role} ${address} holds ${formatEther(eth)} ETH, under ${formatEther(minEthWei)}`,
      );
    }
    if (!trac) continue;
    if (tracWei === undefined) deps.logger.warn(`health-unreadable: ${role} ${address}: TRAC`);
    else if (tracWei < minTracWei) {
      problems.push(
        `${role} ${address} holds ${formatEther(tracWei)} TRAC, under ${formatEther(minTracWei)}`,
      );
    }
  }
  return problems;
}

/**
 * One contract's requests pending past `oldestPendingMs` among those read this hour:
 * `pagesPerHour` pages of ids, the first after the last hour's, so a backlog of more is read in
 * turns, and their requests 10 at a time (`readPending`).
 */
async function contractPending(
  deps: HealthDeps,
  contract: string,
  nowMs: number,
): Promise<ContractPending> {
  const { pageSize, pagesPerHour, oldestPendingMs } = HEALTH_SETTINGS;
  const address = contract as Hex;
  const count = await deps.readPendingCount(address);
  if (!count.ok) {
    deps.logger.warn(`health-unreachable: ${contract}`);
    return { old: [], read: 0, count: 0 };
  }
  const pages = Math.ceil(count.count / pageSize);
  const hour = Math.floor(nowMs / 3_600_000);
  const ids: Hex[] = [];
  for (let n = 0; n < Math.min(pages, pagesPerHour); n += 1) {
    const page = (hour * pagesPerHour + n) % pages;
    const read = await deps.readPendingIds(address, page * pageSize, pageSize);
    if (!read.ok) {
      deps.logger.warn(`health-unreachable: ${contract}`);
      break;
    }
    ids.push(...read.ids);
  }
  const { pending, unreadable } = await readPending(deps, address, ids);
  if (unreadable > 0) {
    deps.logger.warn(`health-unreadable: ${contract}: ${unreadable} of ${ids.length} requests`);
  }
  const old = pending
    .map(({ requestId, requestedAt }) => ({
      contract,
      requestId,
      ageMs: nowMs - requestedAt * 1000,
    }))
    .filter(({ ageMs }) => ageMs > oldestPendingMs);
  return { old, read: ids.length, count: count.count };
}

/** The line for the requests pending past `oldestPendingMs` on every contract, if any. */
function pendingProblem(found: readonly ContractPending[]): string[] {
  const old = found.flatMap((contract) => contract.old).sort((a, b) => b.ageMs - a.ageMs);
  const oldest = old[0];
  if (!oldest) return [];
  const read = found.reduce((sum, contract) => sum + contract.read, 0);
  const count = found.reduce((sum, contract) => sum + contract.count, 0);
  const hours = Math.floor(oldest.ageMs / 3_600_000);
  const sampled = read < count ? ` (${read} of the ${count} pending read this hour)` : "";
  return [
    `${old.length} rating requests pending over ${HEALTH_SETTINGS.oldestPendingMs / 3_600_000} h; the oldest, ${oldest.requestId} on ${oldest.contract}, for ${hours} h${sampled}`,
  ];
}

/**
 * The `check-health` Inngest cron: every hour, reads the DKG node, the balances and the
 * pending requests and, when something needs the maintainer, sends one alert listing it
 * (ADR 0038). `getDeps` builds the reads on the first run, so importing the function validates
 * no settings.
 */
export function createHealthCheck(
  inngest: Inngest.Any,
  getDeps: () => HealthDeps,
  alert: (text: string) => Promise<void>,
) {
  return inngest.createFunction(
    { id: "check-health", triggers: [{ cron: HEALTH_SETTINGS.cron }], singleton: { mode: "skip" } },
    async ({ step }) =>
      runHealthCheck({ run: (id, fn) => step.run(id, fn) as never }, getDeps, alert, () =>
        Date.now(),
      ),
  );
}
