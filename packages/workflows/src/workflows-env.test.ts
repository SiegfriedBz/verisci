import { EnvError } from "@verisci/env";
import { describe, expect, it } from "vitest";
import { createWorkflowsEnv } from "./workflows-env.ts";

const runtimeEnv = {
  APP_ENV: "staging",
  DKG_URL: "http://127.0.0.1:9200",
  DKG_TOKEN: "secret-admin-token",
  DKG_CONTEXT_GRAPH: "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging",
  GROBID_URL: "http://127.0.0.1:8070",
  PINATA_GATEWAY_URL: "https://example.mypinata.cloud",
  CHAIN_RPC_URL: "https://sepolia.base.org",
  PINATA_JWT: "secret-pinata-jwt",
  INNGEST_EVENT_KEY: "secret-event-key",
  INNGEST_SIGNING_KEY: "signkey-test-0123",
};

describe("createWorkflowsEnv", () => {
  it("returns GROBID, the gateway and the RPC URL with the DKG and shared settings", () => {
    const env = createWorkflowsEnv(runtimeEnv);

    expect(env.GROBID_URL).toBe("http://127.0.0.1:8070");
    expect(env.PINATA_GATEWAY_URL).toBe("https://example.mypinata.cloud");
    expect(env.CHAIN_RPC_URL).toBe("https://sepolia.base.org");
    expect(env.DKG_CONTEXT_GRAPH).toBe(runtimeEnv.DKG_CONTEXT_GRAPH);
    expect(env.APP_ENV).toBe("staging");
  });

  it("names every missing or invalid variable", () => {
    let caught: unknown;
    try {
      createWorkflowsEnv({ ...runtimeEnv, GROBID_URL: undefined, CHAIN_RPC_URL: "not a url" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvError);
    expect((caught as EnvError).issues.map((issue) => issue.variable).sort()).toEqual([
      "CHAIN_RPC_URL",
      "GROBID_URL",
    ]);
  });

  it("names bad DKG and workflows variables in one error", () => {
    let caught: unknown;
    try {
      createWorkflowsEnv({ ...runtimeEnv, DKG_TOKEN: undefined, GROBID_URL: undefined });
    } catch (error) {
      caught = error;
    }

    expect((caught as EnvError).issues.map((issue) => issue.variable).sort()).toEqual([
      "DKG_TOKEN",
      "GROBID_URL",
    ]);
  });

  it("returns the Pinata key and Inngest's keys", () => {
    const env = createWorkflowsEnv(runtimeEnv);

    expect(env.PINATA_JWT).toBe("secret-pinata-jwt");
    expect(env.INNGEST_EVENT_KEY).toBe("secret-event-key");
    expect(env.INNGEST_SIGNING_KEY).toBe("signkey-test-0123");
  });

  it("requires Inngest's keys outside local, where the dev server needs none", () => {
    const keyless = { ...runtimeEnv, INNGEST_EVENT_KEY: undefined, INNGEST_SIGNING_KEY: undefined };
    let caught: unknown;
    try {
      createWorkflowsEnv(keyless);
    } catch (error) {
      caught = error;
    }

    expect((caught as EnvError).issues.map((issue) => issue.variable).sort()).toEqual([
      "INNGEST_EVENT_KEY",
      "INNGEST_SIGNING_KEY",
    ]);
    expect(
      createWorkflowsEnv({ ...keyless, APP_ENV: "local" }).INNGEST_SIGNING_KEY,
    ).toBeUndefined();
  });

  it("requires the Pinata key", () => {
    expect(() => createWorkflowsEnv({ ...runtimeEnv, PINATA_JWT: "" })).toThrow(EnvError);
  });

  it("keeps the DKG node's -prod guard", () => {
    expect(() =>
      createWorkflowsEnv({
        ...runtimeEnv,
        DKG_CONTEXT_GRAPH: `${runtimeEnv.DKG_CONTEXT_GRAPH}-prod`,
      }),
    ).toThrow(EnvError);
  });
});
