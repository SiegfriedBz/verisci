import { EnvError } from "@verisci/env";
import { describe, expect, it } from "vitest";
import { contextGraphSchema, createDkgEnv } from "./dkg-env.ts";

const AGENT = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3";
const TOKEN = "secret-admin-token";

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
    const error = envError({ APP_ENV: appEnv, DKG_CONTEXT_GRAPH: `${AGENT}/verisci-prod` });

    expect(error.issues.map((issue) => issue.variable)).toEqual(["DKG_CONTEXT_GRAPH"]);
  });

  it("requires a -prod graph when APP_ENV is production", () => {
    const error = envError({ APP_ENV: "production" });

    expect(error.issues.map((issue) => issue.variable)).toEqual(["DKG_CONTEXT_GRAPH"]);
  });

  it("accepts a -prod graph when APP_ENV is production", () => {
    const env = createDkgEnv(
      runtimeEnv({ APP_ENV: "production", DKG_CONTEXT_GRAPH: `${AGENT}/verisci-prod` }),
    );

    expect(env.DKG_CONTEXT_GRAPH).toBe(`${AGENT}/verisci-prod`);
  });

  it("refuses a bare graph name, which reads another, empty graph", () => {
    const error = envError({ DKG_CONTEXT_GRAPH: "verisci-staging" });

    expect(error.issues.map((issue) => issue.variable)).toEqual(["DKG_CONTEXT_GRAPH"]);
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
    [false, `${AGENT}/verisci-prod`, false],
    [false, "verisci-staging", false],
    [true, `${AGENT}/verisci-prod`, true],
    [true, `${AGENT}/verisci-staging`, false],
  ])("in production %s, accepts %s: %s", (isProduction, id, accepted) => {
    expect(contextGraphSchema(isProduction).safeParse(id).success).toBe(accepted);
  });
});
