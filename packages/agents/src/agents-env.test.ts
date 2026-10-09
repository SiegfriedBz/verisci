import { EnvError } from "@verisci/env";
import { describe, expect, it } from "vitest";
import { createAgentsEnv } from "./agents-env.ts";

const runtimeEnv = {
  APP_ENV: "staging",
  DKG_URL: "http://127.0.0.1:9200",
  DKG_TOKEN: "secret-admin-token",
  DKG_CONTEXT_GRAPH: "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging",
  GROBID_URL: "http://127.0.0.1:8070",
  PINATA_GATEWAY_URL: "https://example.mypinata.cloud",
  CHAIN_RPC_URL: "https://sepolia.base.org",
};

describe("createAgentsEnv", () => {
  it("returns GROBID, the gateway and the RPC URL with the DKG and shared settings", () => {
    const env = createAgentsEnv(runtimeEnv);

    expect(env.GROBID_URL).toBe("http://127.0.0.1:8070");
    expect(env.PINATA_GATEWAY_URL).toBe("https://example.mypinata.cloud");
    expect(env.CHAIN_RPC_URL).toBe("https://sepolia.base.org");
    expect(env.DKG_CONTEXT_GRAPH).toBe(runtimeEnv.DKG_CONTEXT_GRAPH);
    expect(env.APP_ENV).toBe("staging");
  });

  it("names every missing or invalid variable", () => {
    let caught: unknown;
    try {
      createAgentsEnv({ ...runtimeEnv, GROBID_URL: undefined, CHAIN_RPC_URL: "not a url" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvError);
    expect((caught as EnvError).issues.map((issue) => issue.variable).sort()).toEqual([
      "CHAIN_RPC_URL",
      "GROBID_URL",
    ]);
  });

  it("keeps the DKG node's -prod guard", () => {
    expect(() =>
      createAgentsEnv({ ...runtimeEnv, DKG_CONTEXT_GRAPH: `${runtimeEnv.DKG_CONTEXT_GRAPH}-prod` }),
    ).toThrow(EnvError);
  });
});
