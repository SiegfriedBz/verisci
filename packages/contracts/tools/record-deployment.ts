// Records a RatingController deployment from the run file `forge script --broadcast` writes.
// Usage: node tools/record-deployment.ts <staging|production>, or --init for an empty file.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BASE_SEPOLIA_CHAIN_ID } from "@verisci/core";
import { z } from "zod";
import {
  type DeployEnv,
  type Deployment,
  type DeploymentsFile,
  parseDeployments,
} from "../src/deployments.ts";

const runSchema = z.object({
  chain: z.int(),
  commit: z.string().nullish(),
  transactions: z.array(
    z.object({
      hash: z.string().nullable(),
      transactionType: z.string(),
      contractName: z.string().nullish(),
      contractAddress: z.string().nullish(),
      arguments: z.array(z.string()).nullish(),
      transaction: z.object({ from: z.string() }),
    }),
  ),
  receipts: z.array(
    z.object({ transactionHash: z.string(), blockNumber: z.string(), status: z.string() }),
  ),
});

/** A deployments file with no deployment in either environment. */
export function emptyDeployments(): DeploymentsFile {
  return {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    staging: { current: null, past: [] },
    production: { current: null, past: [] },
  };
}

/**
 * Adds the RatingController that a broadcast run created to an environment: it becomes
 * `current`, and the previous `current` moves to the front of `past`. Returns a new file.
 * @throws Error when the run is not one successful RatingController deployment on the
 * file's chain, or when that address is already recorded.
 */
export function recordDeployment(
  file: DeploymentsFile,
  deployEnv: string,
  run: unknown,
): DeploymentsFile {
  if (deployEnv !== "staging" && deployEnv !== "production") {
    throw new Error(`Unknown environment "${deployEnv}": expected staging or production`);
  }
  const parsed = runSchema.safeParse(run);
  if (!parsed.success) {
    throw new Error(`Unexpected run file:\n${z.prettifyError(parsed.error)}`);
  }
  const { chain, commit, transactions, receipts } = parsed.data;
  if (chain !== file.chainId) {
    throw new Error(`The run is from chain ${chain}; the deployments file is for ${file.chainId}`);
  }

  const creates = transactions.filter(
    (t) => t.transactionType === "CREATE" && t.contractName === "RatingController",
  );
  const [create] = creates;
  if (creates.length !== 1 || create === undefined) {
    throw new Error(`Expected one RatingController CREATE in the run, found ${creates.length}`);
  }
  if (create.hash === null) {
    throw new Error("The RatingController CREATE has no hash: record a run made with --broadcast");
  }
  const hash = create.hash.toLowerCase();
  const receipt = receipts.find((r) => r.transactionHash.toLowerCase() === hash);
  if (receipt?.status !== "0x1") {
    throw new Error(`No successful receipt for ${hash}: record a run made with --broadcast`);
  }

  const [oracleAgent, maxPending] = create.arguments ?? [];
  const deployment: Deployment = {
    address: create.contractAddress?.toLowerCase() ?? "",
    txHash: hash,
    blockNumber: Number(BigInt(receipt.blockNumber)),
    owner: create.transaction.from.toLowerCase(),
    oracleAgent: oracleAgent?.toLowerCase() ?? "",
    maxPendingPerRequester: Number(maxPending),
    commit: commit ?? "",
  };

  const { current, past } = file[deployEnv];
  const recorded = current === null ? past : [current, ...past];
  if (recorded.some((d) => d.address === deployment.address)) {
    throw new Error(`${deployment.address} is already recorded for ${deployEnv}`);
  }
  // Validates the new entry too, so a malformed run never reaches the committed file.
  return parseDeployments({ ...file, [deployEnv]: { current: deployment, past: recorded } });
}

/**
 * Writes an empty deployments file.
 * @throws Error when the file already exists.
 */
export function initDeploymentsFile(deploymentsPath: string): void {
  if (existsSync(deploymentsPath)) throw new Error(`${deploymentsPath} already exists`);
  write(deploymentsPath, emptyDeployments());
}

/**
 * Records a broadcast run into the deployments file; writes nothing when the run is rejected.
 * @throws Error when either file is missing or the run is rejected.
 */
export function recordDeploymentFile(
  deploymentsPath: string,
  runPath: string,
  deployEnv: DeployEnv | string,
): void {
  if (!existsSync(runPath)) {
    throw new Error(`${runPath} not found: deploy with --broadcast first`);
  }
  const file = parseDeployments(JSON.parse(readFileSync(deploymentsPath, "utf8")));
  const run: unknown = JSON.parse(readFileSync(runPath, "utf8"));
  write(deploymentsPath, recordDeployment(file, deployEnv, run));
}

function write(path: string, file: DeploymentsFile): void {
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}

if (import.meta.main) {
  const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
  const deploymentsPath = root("deployments/base-sepolia.json");
  const [arg = ""] = process.argv.slice(2);
  if (arg === "--init") {
    initDeploymentsFile(deploymentsPath);
  } else {
    const runPath = root(
      `broadcast/DeployRatingController.s.sol/${BASE_SEPOLIA_CHAIN_ID}/run-latest.json`,
    );
    recordDeploymentFile(deploymentsPath, runPath, arg);
  }
}
