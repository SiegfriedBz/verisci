import { EnvError } from "@labstrail/env";
import { describe, expect, it } from "vitest";
import { createWebEnv } from "./web-env.ts";

const settings = {
  APP_ENV: "staging",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "secret-upstash-token",
  REOWN_PROJECT_ID: "0123456789abcdef0123456789abcdef",
};

function issues(runtimeEnv: Record<string, string | undefined>): string[] {
  try {
    createWebEnv(runtimeEnv);
  } catch (error) {
    return (error as EnvError).issues.map((issue) => issue.variable).sort();
  }
  return [];
}

describe("createWebEnv", () => {
  it("returns Upstash's address and token and the Reown project id", () => {
    const env = createWebEnv(settings);

    expect(env.UPSTASH_REDIS_REST_URL).toBe("https://example.upstash.io");
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBe("secret-upstash-token");
    expect(env.REOWN_PROJECT_ID).toBe(settings.REOWN_PROJECT_ID);
  });

  it("requires all three outside local", () => {
    expect(
      issues({
        APP_ENV: "production",
        UPSTASH_REDIS_REST_URL: "not a url",
      }),
    ).toEqual(["REOWN_PROJECT_ID", "UPSTASH_REDIS_REST_TOKEN", "UPSTASH_REDIS_REST_URL"]);
  });

  it("reads the addresses Vercel gives a deployment, for the site's links", () => {
    const env = createWebEnv({
      ...settings,
      VERCEL_PROJECT_PRODUCTION_URL: "labstrail.vercel.app",
      VERCEL_BRANCH_URL: "labstrail-git-develop-siegfriedbzs-projects.vercel.app",
    });

    expect(env.VERCEL_PROJECT_PRODUCTION_URL).toBe("labstrail.vercel.app");
    expect(env.VERCEL_BRANCH_URL).toBe("labstrail-git-develop-siegfriedbzs-projects.vercel.app");
  });

  it("needs none locally", () => {
    expect(createWebEnv({ APP_ENV: "local" }).UPSTASH_REDIS_REST_URL).toBeUndefined();
  });

  it("reads the local chain's URL and contract locally, for the rating pages", () => {
    const env = createWebEnv({
      APP_ENV: "local",
      LOCAL_CHAIN_RPC_URL: "http://127.0.0.1:8546",
      LOCAL_RATING_CONTRACT: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    });

    expect(env.LOCAL_CHAIN_RPC_URL).toBe("http://127.0.0.1:8546");
    expect(env.LOCAL_RATING_CONTRACT).toBe("0x5FbDB2315678afecb367f032d93F642f64180aa3");
  });

  it("refuses a local chain setting that is not a URL or an address", () => {
    expect(
      issues({ APP_ENV: "local", LOCAL_CHAIN_RPC_URL: "anvil", LOCAL_RATING_CONTRACT: "0x12" }),
    ).toEqual(["LOCAL_CHAIN_RPC_URL", "LOCAL_RATING_CONTRACT"]);
  });

  it("ignores the local chain settings outside local", () => {
    expect(issues({ ...settings, LOCAL_CHAIN_RPC_URL: "anvil" })).toEqual([]);
  });

  it("throws EnvError", () => {
    expect(() => createWebEnv({ APP_ENV: "staging" })).toThrow(EnvError);
  });
});
