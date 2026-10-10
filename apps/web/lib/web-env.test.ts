import { EnvError } from "@verisci/env";
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

  it("needs none locally", () => {
    expect(createWebEnv({ APP_ENV: "local" }).UPSTASH_REDIS_REST_URL).toBeUndefined();
  });

  it("throws EnvError", () => {
    expect(() => createWebEnv({ APP_ENV: "staging" })).toThrow(EnvError);
  });
});
