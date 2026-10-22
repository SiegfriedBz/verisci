import { EnvError } from "@labstrail/env";
import { describe, expect, it } from "vitest";
import {
  checkRatingSettings,
  createRatingEnv,
  ratingSettingsRequired,
  servesRating,
} from "./rating-env.ts";

const ORACLE_KEY = `0x${"59c6".repeat(16)}`;
const workflows = {
  APP_ENV: "staging",
  DKG_URL: "http://127.0.0.1:9200",
  DKG_TOKEN: "secret-admin-token",
  DKG_CONTEXT_GRAPH: "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging",
  GROBID_URL: "http://127.0.0.1:8070",
  PINATA_GATEWAY_URL: "https://example.mypinata.cloud",
  CHAIN_RPC_URL: "https://sepolia.base.org",
  PINATA_JWT: "secret-pinata-jwt",
  GEMINI_API_KEY: "secret-gemini",
  INNGEST_EVENT_KEY: "secret-event-key",
  INNGEST_SIGNING_KEY: "signkey-test-0123",
  TELEGRAM_BOT_TOKEN: "123456:AAH-secret_token",
  TELEGRAM_CHAT_ID: "-1001234567",
};
const PUBLISHER = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3";
const rating = { ...workflows, ORACLE_PRIVATE_KEY: ORACLE_KEY, PUBLISHER_ADDRESSES: PUBLISHER };
const local = {
  ...rating,
  PUBLISHER_ADDRESSES: undefined,
  APP_ENV: "local",
  LOCAL_CHAIN_RPC_URL: "http://127.0.0.1:8546",
  LOCAL_RATING_CONTRACT: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
};

function issues(runtimeEnv: Record<string, string | undefined>) {
  try {
    createRatingEnv(runtimeEnv);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError);
    return (error as EnvError).issues;
  }
  return [];
}

describe("createRatingEnv", () => {
  it("returns the oracle key and the Gemini key with the workflows' settings on staging", () => {
    const env = createRatingEnv(rating);

    expect(env.ORACLE_PRIVATE_KEY).toBe(ORACLE_KEY);
    expect(env.GEMINI_API_KEY).toBe("secret-gemini");
    expect(env.GROBID_URL).toBe("http://127.0.0.1:8070");
    expect(env.APP_ENV).toBe("staging");
  });

  it("needs no local setting on staging or production", () => {
    expect(issues(rating)).toEqual([]);
    expect(
      issues({
        ...rating,
        APP_ENV: "production",
        DKG_CONTEXT_GRAPH: `${rating.DKG_CONTEXT_GRAPH.replace("staging", "prod")}`,
      }),
    ).toEqual([]);
  });

  it("requires Anvil's URL and the local contract when APP_ENV is local", () => {
    expect(createRatingEnv(local).LOCAL_RATING_CONTRACT).toBe(local.LOCAL_RATING_CONTRACT);
    expect(
      issues({ ...local, LOCAL_CHAIN_RPC_URL: undefined, LOCAL_RATING_CONTRACT: "0x1234" })
        .map((issue) => issue.variable)
        .sort(),
    ).toEqual(["LOCAL_CHAIN_RPC_URL", "LOCAL_RATING_CONTRACT"]);
  });

  it("requires the node's publisher wallets outside local, so a deployment that would watch none refuses to start (ADRs 0006, 0015)", () => {
    for (const appEnv of ["staging", "production"]) {
      expect(
        issues({
          ...rating,
          APP_ENV: appEnv,
          DKG_CONTEXT_GRAPH: rating.DKG_CONTEXT_GRAPH.replace(
            "staging",
            appEnv === "production" ? "prod" : "staging",
          ),
          PUBLISHER_ADDRESSES: undefined,
        }).map((issue) => issue.variable),
      ).toEqual(["PUBLISHER_ADDRESSES"]);
    }
    expect(createRatingEnv(local).PUBLISHER_ADDRESSES).toEqual([]);
  });

  it("takes the node's publisher wallets as a comma-separated list, lowercase", () => {
    expect(
      createRatingEnv({
        ...rating,
        PUBLISHER_ADDRESSES:
          "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3, 0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
      }).PUBLISHER_ADDRESSES,
    ).toEqual([
      "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
      "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
    ]);
    expect(() => createRatingEnv({ ...rating, PUBLISHER_ADDRESSES: "0x12,nope" })).toThrow(
      /PUBLISHER_ADDRESSES/,
    );
  });

  it("names every bad setting, the workflows' included, in one error", () => {
    expect(
      issues({ ...rating, ORACLE_PRIVATE_KEY: undefined, GEMINI_API_KEY: "", GROBID_URL: "x" })
        .map((issue) => issue.variable)
        .sort(),
    ).toEqual(["GEMINI_API_KEY", "GROBID_URL", "ORACLE_PRIVATE_KEY"]);
  });

  it.each([
    ["too short", "0x1234"],
    ["without 0x", "59c6".repeat(16)],
    ["not hex", `0x${"zz".repeat(32)}`],
  ])("refuses an oracle key %s, without showing it", (_, key) => {
    const [issue] = issues({ ...rating, ORACLE_PRIVATE_KEY: key });

    expect(issue?.variable).toBe("ORACLE_PRIVATE_KEY");
    expect(issue?.message).not.toContain(key);
  });
});

describe("servesRating", () => {
  it("serves the rating functions only where the oracle key is set", () => {
    expect(servesRating({ ORACLE_PRIVATE_KEY: ORACLE_KEY })).toBe(true);
    expect(servesRating({ ORACLE_PRIVATE_KEY: "" })).toBe(false);
    expect(servesRating({})).toBe(false);
  });
});

describe("ratingSettingsRequired", () => {
  it("requires them in production, even without a key (ADR 0019)", () => {
    expect(ratingSettingsRequired({ APP_ENV: "production" })).toBe(true);
  });

  it("requires them on staging only with a key", () => {
    expect(ratingSettingsRequired({ APP_ENV: "staging", ORACLE_PRIVATE_KEY: ORACLE_KEY })).toBe(
      true,
    );
    expect(ratingSettingsRequired({ APP_ENV: "staging" })).toBe(false);
  });

  it("never requires them locally, where a server checks nothing at start", () => {
    expect(ratingSettingsRequired({ APP_ENV: "local", ORACLE_PRIVATE_KEY: ORACLE_KEY })).toBe(
      false,
    );
    expect(ratingSettingsRequired({})).toBe(false);
  });
});

describe("checkRatingSettings", () => {
  it("checks the rating settings only where they are required", () => {
    expect(() => checkRatingSettings({ ...workflows })).not.toThrow();
    expect(() => checkRatingSettings({ ...workflows, ORACLE_PRIVATE_KEY: "0x12" })).toThrow(
      /ORACLE_PRIVATE_KEY/,
    );
    expect(() => checkRatingSettings(rating)).not.toThrow();
  });
});
