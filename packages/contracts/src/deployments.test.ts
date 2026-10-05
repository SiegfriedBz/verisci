import { BASE_SEPOLIA_CHAIN_ID } from "@verisci/core";
import { describe, expect, it } from "vitest";
import {
  type Deployment,
  type DeploymentsFile,
  NoDeploymentError,
  parseDeployments,
  resolveDeployments,
} from "./deployments.ts";

const BLOCK_NUMBER = 1_000;
const MAX_PENDING_PER_REQUESTER = 3;

const deployment = (n: number): Deployment => ({
  address: `0x${String(n).padStart(40, "0")}`,
  txHash: `0x${String(n).padStart(64, "0")}`,
  blockNumber: BLOCK_NUMBER + n,
  owner: `0x${"a".repeat(40)}`,
  oracleAgent: `0x${"b".repeat(40)}`,
  maxPendingPerRequester: MAX_PENDING_PER_REQUESTER,
  commit: "abc1234",
});

const file: DeploymentsFile = {
  chainId: BASE_SEPOLIA_CHAIN_ID,
  staging: { current: deployment(2), past: [deployment(1)] },
  production: { current: null, past: [] },
};

describe("resolveDeployments", () => {
  it("returns staging's current and past deployments", () => {
    expect(resolveDeployments(file, "staging")).toEqual({
      chainId: BASE_SEPOLIA_CHAIN_ID,
      current: deployment(2),
      past: [deployment(1)],
    });
  });

  it("resolves local to staging's deployments", () => {
    expect(resolveDeployments(file, "local")).toEqual(resolveDeployments(file, "staging"));
  });

  it("throws NoDeploymentError naming an environment with no current deployment", () => {
    expect(() => resolveDeployments(file, "production")).toThrow(NoDeploymentError);
    expect(() => resolveDeployments(file, "production")).toThrow(/production/);
  });
});

describe("parseDeployments", () => {
  it("accepts a valid file", () => {
    expect(parseDeployments(file)).toEqual(file);
  });

  it("names the field of a malformed entry", () => {
    const bad = { ...file, staging: { current: { ...deployment(2), address: "0x12" }, past: [] } };
    expect(() => parseDeployments(bad)).toThrow(/staging\.current\.address/);
  });

  it("rejects a file missing an environment", () => {
    const { production: _, ...bad } = file;
    expect(() => parseDeployments(bad)).toThrow(/production/);
  });
});
