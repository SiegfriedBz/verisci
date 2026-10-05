import { describe, expect, it } from "vitest";
import {
  type Deployment,
  type DeploymentsFile,
  NoDeploymentError,
  parseDeployments,
  resolveDeployments,
} from "./deployments.ts";

const deployment = (n: number): Deployment => ({
  address: `0x${String(n).padStart(40, "0")}`,
  txHash: `0x${String(n).padStart(64, "0")}`,
  blockNumber: 100 + n,
  owner: `0x${"a".repeat(40)}`,
  oracleAgent: `0x${"b".repeat(40)}`,
  maxPendingPerRequester: 3,
  commit: "abc1234",
});

const file: DeploymentsFile = {
  chainId: 84532,
  staging: { current: deployment(2), past: [deployment(1)] },
  production: { current: null, past: [] },
};

describe("resolveDeployments", () => {
  it("returns staging's current and past deployments", () => {
    expect(resolveDeployments(file, "staging")).toEqual({
      chainId: 84532,
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
