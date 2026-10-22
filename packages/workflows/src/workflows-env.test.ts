import { EnvError } from "@labstrail/env";
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
  GEMINI_API_KEY: "secret-gemini",
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

  it("requires the Gemini key, which the publish run's field check reads", () => {
    expect(createWorkflowsEnv(runtimeEnv).GEMINI_API_KEY).toBe("secret-gemini");
    expect(() => createWorkflowsEnv({ ...runtimeEnv, GEMINI_API_KEY: undefined })).toThrow(
      /GEMINI_API_KEY/,
    );
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

  it("takes the Telegram bot and chat as optional, and refuses malformed ones without their value", () => {
    expect(createWorkflowsEnv(runtimeEnv).TELEGRAM_BOT_TOKEN).toBeUndefined();
    const env = createWorkflowsEnv({
      ...runtimeEnv,
      TELEGRAM_BOT_TOKEN: "123456:AAH-secret_token",
      TELEGRAM_CHAT_ID: "-1001234567",
    });
    expect(env.TELEGRAM_BOT_TOKEN).toBe("123456:AAH-secret_token");
    expect(env.TELEGRAM_CHAT_ID).toBe("-1001234567");

    let caught: unknown;
    try {
      createWorkflowsEnv({
        ...runtimeEnv,
        TELEGRAM_BOT_TOKEN: "leaked token",
        TELEGRAM_CHAT_ID: "chat",
      });
    } catch (error) {
      caught = error;
    }
    expect((caught as EnvError).issues.map((issue) => issue.variable).sort()).toEqual([
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_ID",
    ]);
    expect(String((caught as EnvError).message)).not.toContain("leaked token");
  });

  it("requires the Telegram bot and chat on production, naming each (ADR 0038)", () => {
    const production = {
      ...runtimeEnv,
      APP_ENV: "production",
      DKG_CONTEXT_GRAPH: `${runtimeEnv.DKG_CONTEXT_GRAPH.split("/")[0]}/verisci-prod`,
    };
    let caught: unknown;
    try {
      createWorkflowsEnv(production);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvError);
    expect((caught as EnvError).issues.map((issue) => issue.variable).sort()).toEqual([
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_ID",
    ]);
    expect(
      createWorkflowsEnv({
        ...production,
        TELEGRAM_BOT_TOKEN: "123456:AAH-secret_token",
        TELEGRAM_CHAT_ID: "-1001234567",
      }).TELEGRAM_CHAT_ID,
    ).toBe("-1001234567");
    expect(
      createWorkflowsEnv({ ...runtimeEnv, APP_ENV: "local" }).TELEGRAM_CHAT_ID,
    ).toBeUndefined();
  });

  it("requires the Pinata key", () => {
    expect(() => createWorkflowsEnv({ ...runtimeEnv, PINATA_JWT: "" })).toThrow(EnvError);
  });

  it("refuses a context graph whose address is not in the node's checksum case", () => {
    const lowercase = runtimeEnv.DKG_CONTEXT_GRAPH.toLowerCase();
    let caught: unknown;
    try {
      createWorkflowsEnv({ ...runtimeEnv, DKG_CONTEXT_GRAPH: lowercase });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvError);
    const [issue] = (caught as EnvError).issues;
    expect(issue?.variable).toBe("DKG_CONTEXT_GRAPH");
    expect(issue?.message).toMatch(/EIP-55/);
    expect(issue?.message).not.toContain("0xd701");
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
