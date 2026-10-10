// @vitest-environment node
import { createAgentsEnv } from "@verisci/agents";
import { EnvError, type RuntimeEnv } from "@verisci/env";
import { describe, expect, it } from "vitest";
import { checkWorkflowSettings as check } from "./instrumentation.ts";

const checkWorkflowSettings = (runtimeEnv: RuntimeEnv) => check(runtimeEnv, createAgentsEnv);

const settings = {
  DKG_URL: "http://127.0.0.1:9200",
  DKG_TOKEN: "secret-admin-token",
  DKG_CONTEXT_GRAPH: "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging",
  GROBID_URL: "http://127.0.0.1:8070",
  PINATA_GATEWAY_URL: "https://example.mypinata.cloud",
  CHAIN_RPC_URL: "https://sepolia.base.org",
};

describe("checkWorkflowSettings", () => {
  it("checks nothing locally, so pnpm dev runs with no settings", () => {
    expect(() => checkWorkflowSettings({ APP_ENV: "local" })).not.toThrow();
  });

  it("refuses to start a deployed server with a missing setting, naming it", () => {
    const start = () =>
      checkWorkflowSettings({ APP_ENV: "staging", ...settings, GROBID_URL: undefined });

    expect(start).toThrow(EnvError);
    expect(start).toThrow(/GROBID_URL/);
  });

  it("refuses a -prod graph on staging at start (ADR 0005)", () => {
    expect(() =>
      checkWorkflowSettings({
        APP_ENV: "staging",
        ...settings,
        DKG_CONTEXT_GRAPH: `${settings.DKG_CONTEXT_GRAPH.split("/")[0]}/verisci-prod`,
      }),
    ).toThrow(EnvError);
  });

  it("starts a deployed server whose settings are valid", () => {
    expect(() => checkWorkflowSettings({ APP_ENV: "staging", ...settings })).not.toThrow();
  });
});
