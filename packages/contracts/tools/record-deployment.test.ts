import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DeploymentsFile } from "../src/deployments.ts";
import {
  emptyDeployments,
  initDeploymentsFile,
  recordDeployment,
  recordDeploymentFile,
} from "./record-deployment.ts";

const ORACLE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const OWNER = "0x1804c8ab1f12e6bbf3894d4083f33e07309d1f38";

/** The shape `forge script --broadcast` writes to `run-latest.json`, trimmed to what is read. */
const broadcastRun = (address: string, hash: string, blockNumber = "0x1a2b") => ({
  chain: 84532,
  commit: "ca48594",
  transactions: [
    {
      hash,
      transactionType: "CREATE",
      contractName: "RatingController",
      contractAddress: address,
      arguments: [ORACLE, "3"],
      transaction: { from: OWNER },
    },
  ],
  receipts: [{ transactionHash: hash, blockNumber, status: "0x1" }],
});

const ADDRESS_1 = `0x${"1".repeat(40)}`;
const ADDRESS_2 = `0x${"2".repeat(40)}`;
const HASH_1 = `0x${"a".repeat(64)}`;
const HASH_2 = `0x${"b".repeat(64)}`;

describe("recordDeployment", () => {
  it("records a first deployment as current", () => {
    const file = recordDeployment(emptyDeployments(), "staging", broadcastRun(ADDRESS_1, HASH_1));
    expect(file.staging).toEqual({
      current: {
        address: ADDRESS_1,
        txHash: HASH_1,
        blockNumber: 0x1a2b,
        owner: OWNER,
        oracleAgent: ORACLE.toLowerCase(),
        maxPendingPerRequester: 3,
        commit: "ca48594",
      },
      past: [],
    });
    expect(file.production).toEqual({ current: null, past: [] });
  });

  it("moves the current deployment to the front of past", () => {
    const first = recordDeployment(emptyDeployments(), "staging", broadcastRun(ADDRESS_1, HASH_1));
    const second = recordDeployment(first, "staging", broadcastRun(ADDRESS_2, HASH_2));
    expect(second.staging.current?.address).toBe(ADDRESS_2);
    expect(second.staging.past.map((d) => d.address)).toEqual([ADDRESS_1]);
  });

  it("throws on a run with no RatingController CREATE", () => {
    const run = { ...broadcastRun(ADDRESS_1, HASH_1), transactions: [] };
    expect(() => recordDeployment(emptyDeployments(), "staging", run)).toThrow(
      /RatingController CREATE/,
    );
  });

  it("throws on a dry run, which has no transaction hash", () => {
    const run = broadcastRun(ADDRESS_1, HASH_1);
    const dryRun = { ...run, transactions: [{ ...run.transactions[0], hash: null }], receipts: [] };
    expect(() => recordDeployment(emptyDeployments(), "staging", dryRun)).toThrow(/--broadcast/);
  });

  it("throws on a run from another chain", () => {
    const run = { ...broadcastRun(ADDRESS_1, HASH_1), chain: 31337 };
    expect(() => recordDeployment(emptyDeployments(), "staging", run)).toThrow(/chain 31337/);
  });

  it("throws on an address already recorded in that environment", () => {
    const first = recordDeployment(emptyDeployments(), "staging", broadcastRun(ADDRESS_1, HASH_1));
    expect(() => recordDeployment(first, "staging", broadcastRun(ADDRESS_1, HASH_2))).toThrow(
      /already recorded/,
    );
  });

  it("throws on an environment other than staging or production", () => {
    expect(() =>
      recordDeployment(emptyDeployments(), "local", broadcastRun(ADDRESS_1, HASH_1)),
    ).toThrow(/staging or production/);
  });
});

describe("files", () => {
  const tempPaths = () => {
    const dir = mkdtempSync(join(tmpdir(), "record-deployment-"));
    return { deployments: join(dir, "base-sepolia.json"), run: join(dir, "run-latest.json") };
  };
  const read = (path: string): DeploymentsFile => JSON.parse(readFileSync(path, "utf8"));

  it("--init writes the empty file", () => {
    const paths = tempPaths();
    initDeploymentsFile(paths.deployments);
    expect(read(paths.deployments)).toEqual(emptyDeployments());
  });

  it("--init refuses to overwrite an existing file", () => {
    const paths = tempPaths();
    initDeploymentsFile(paths.deployments);
    expect(() => initDeploymentsFile(paths.deployments)).toThrow(/already exists/);
  });

  it("records a run into the file", () => {
    const paths = tempPaths();
    initDeploymentsFile(paths.deployments);
    writeFileSync(paths.run, JSON.stringify(broadcastRun(ADDRESS_1, HASH_1)));
    recordDeploymentFile(paths.deployments, paths.run, "production");
    expect(read(paths.deployments).production.current?.address).toBe(ADDRESS_1);
  });

  it("writes nothing when the run is rejected", () => {
    const paths = tempPaths();
    initDeploymentsFile(paths.deployments);
    const before = readFileSync(paths.deployments, "utf8");
    writeFileSync(paths.run, JSON.stringify({ ...broadcastRun(ADDRESS_1, HASH_1), chain: 1 }));
    expect(() => recordDeploymentFile(paths.deployments, paths.run, "staging")).toThrow();
    expect(readFileSync(paths.deployments, "utf8")).toBe(before);
  });

  it("names the missing run file", () => {
    const paths = tempPaths();
    initDeploymentsFile(paths.deployments);
    expect(existsSync(paths.run)).toBe(false);
    expect(() => recordDeploymentFile(paths.deployments, paths.run, "staging")).toThrow(
      /run-latest\.json/,
    );
  });
});
