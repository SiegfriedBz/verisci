import { EnvError } from "@labstrail/env";
import { describe, expect, it } from "vitest";
import { contextGraphSchema, createDkgEnv } from "./dkg-env.ts";

const AGENT = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3";
const TOKEN = "secret-admin-token";
/** Production's context graph since 2026-10-19 (ADR 0005). */
const PRODUCTION_GRAPH = `${AGENT}/verisci-main-prod`;

function runtimeEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    APP_ENV: "staging",
    DKG_URL: "http://127.0.0.1:9200",
    DKG_TOKEN: TOKEN,
    DKG_CONTEXT_GRAPH: `${AGENT}/verisci-staging`,
    ...overrides,
  };
}

function envError(overrides: Record<string, string | undefined>): EnvError {
  try {
    createDkgEnv(runtimeEnv(overrides));
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error("expected an EnvError");
}

describe("createDkgEnv", () => {
  it("returns the node URL, token and context graph", () => {
    const env = createDkgEnv(runtimeEnv());

    expect(env.DKG_URL).toBe("http://127.0.0.1:9200");
    expect(env.DKG_TOKEN).toBe(TOKEN);
    expect(env.DKG_CONTEXT_GRAPH).toBe(`${AGENT}/verisci-staging`);
    expect(env.APP_ENV).toBe("staging");
  });

  it.each(["local", "staging"])("refuses a -prod graph when APP_ENV is %s", (appEnv) => {
    const error = envError({ APP_ENV: appEnv, DKG_CONTEXT_GRAPH: PRODUCTION_GRAPH });

    expect(error.issues).toEqual([
      { variable: "DKG_CONTEXT_GRAPH", message: "a -prod graph needs APP_ENV=production" },
    ]);
  });

  it("requires a -prod graph when APP_ENV is production", () => {
    const error = envError({ APP_ENV: "production" });

    expect(error.issues.map((issue) => issue.variable)).toEqual(["DKG_CONTEXT_GRAPH"]);
  });

  it("accepts a -prod graph when APP_ENV is production", () => {
    const env = createDkgEnv(
      runtimeEnv({ APP_ENV: "production", DKG_CONTEXT_GRAPH: PRODUCTION_GRAPH }),
    );

    expect(env.DKG_CONTEXT_GRAPH).toBe(PRODUCTION_GRAPH);
  });

  it("refuses a bare graph name, which reads another, empty graph", () => {
    const error = envError({ DKG_CONTEXT_GRAPH: "verisci-staging" });

    expect(error.issues.map((issue) => issue.variable)).toEqual(["DKG_CONTEXT_GRAPH"]);
  });

  it("refuses an address that is not in the node's checksum case, naming the rule only", () => {
    const error = envError({ DKG_CONTEXT_GRAPH: `${AGENT.toLowerCase()}/verisci-staging` });

    expect(error.issues.map((issue) => issue.variable)).toEqual(["DKG_CONTEXT_GRAPH"]);
    expect(error.issues[0]?.message).toMatch(/EIP-55/);
    expect(error.message).not.toContain(AGENT.toLowerCase());
  });

  it("names a missing token and a bad URL without showing the token", () => {
    const error = envError({ DKG_TOKEN: "", DKG_URL: "not a url" });

    expect(error.issues.map((issue) => issue.variable).sort()).toEqual(["DKG_TOKEN", "DKG_URL"]);
  });

  it("never shows the token in an error", () => {
    const error = envError({ DKG_CONTEXT_GRAPH: TOKEN });

    expect(error.message).not.toContain(TOKEN);
    expect(JSON.stringify(error.issues)).not.toContain(TOKEN);
  });
});

describe("contextGraphSchema", () => {
  it.each([
    [false, `${AGENT}/verisci-staging`, true],
    [false, PRODUCTION_GRAPH, false],
    [false, "verisci-staging", false],
    [false, `${AGENT.toLowerCase()}/verisci-staging`, false],
    [false, `0x${AGENT.slice(2).toUpperCase()}/verisci-staging`, false],
    [true, PRODUCTION_GRAPH, true],
    [true, `${AGENT}/verisci-staging`, false],
  ])("in production %s, accepts %s: %s", (isProduction, id, accepted) => {
    expect(contextGraphSchema(isProduction).safeParse(id).success).toBe(accepted);
  });
});
