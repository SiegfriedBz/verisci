import { NoDeploymentError } from "@labstrail/contracts";
import { describe, expect, it } from "vitest";
import { ratingChainConfig } from "./chain.ts";

const STAGING = {
  chainId: 84_532,
  current: { address: "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90" },
  past: [],
} as never;

describe("ratingChainConfig", () => {
  it("uses the environment's current contract on Base Sepolia when deployed", () => {
    expect(ratingChainConfig({ APP_ENV: "staging" }, () => STAGING)).toEqual({
      chainId: 84_532,
      contract: "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90",
      local: false,
    });
  });

  it("uses the Anvil contract and URL locally, lowercase", () => {
    expect(
      ratingChainConfig({
        APP_ENV: "local",
        LOCAL_CHAIN_RPC_URL: "http://127.0.0.1:8546",
        LOCAL_RATING_CONTRACT: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      }),
    ).toEqual({
      chainId: 31_337,
      contract: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      local: true,
      rpcUrl: "http://127.0.0.1:8546",
    });
  });

  it("has none locally without the Anvil settings", () => {
    expect(ratingChainConfig({ APP_ENV: "local" })).toBeUndefined();
  });

  it("has none for an environment with no deployment", () => {
    expect(
      ratingChainConfig({ APP_ENV: "production" }, () => {
        throw new NoDeploymentError("production");
      }),
    ).toBeUndefined();
  });
});
