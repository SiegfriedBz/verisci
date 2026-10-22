import { createHmac } from "node:crypto";
import { ratingControllerAbi, ratingControllerDeployments } from "@labstrail/contracts";
import { encodeAbiParameters, encodeEventTopics, type Hex, keccak256, toHex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebhookIntake, type WebhookIo } from "./webhook.ts";

const inngestSend = vi.hoisted(() => vi.fn(async (_events: unknown) => ({ ids: [] })));
vi.mock("../inngest.ts", () => ({ inngest: { send: inngestSend } }));

const KEY = "whsec_test_signing_key";
const CURRENT = "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90";
const PAST = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const TARGET = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const REQUEST_ID = `0x${"ab".repeat(32)}` as Hex;

/** A `Phase1Requested` log as our Alchemy Notify GraphQL query returns it. */
function requestLog(address: string, requestId: Hex = REQUEST_ID) {
  return {
    data: encodeAbiParameters([{ type: "string" }, { type: "uint64" }], [TARGET, 1_791_900_000n]),
    topics: encodeEventTopics({
      abi: ratingControllerAbi,
      eventName: "Phase1Requested",
      args: {
        requestId,
        requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
        targetUalHash: keccak256(toHex(TARGET)),
      },
    }),
    account: { address },
  };
}

/** A `Paused` log: the contract's, but not a request. */
const pausedLog = {
  data: encodeAbiParameters([{ type: "address" }], [CURRENT]),
  topics: encodeEventTopics({ abi: ratingControllerAbi, eventName: "Paused" }),
  account: { address: CURRENT },
};

function body(logs: readonly unknown[]): string {
  return JSON.stringify({
    webhookId: "wh_test",
    id: "whevt_test",
    createdAt: "2026-10-16T09:00:00.000Z",
    type: "GRAPHQL",
    event: {
      data: { block: { logs } },
      sequenceNumber: "1",
    },
  });
}

const sign = (raw: string, key = KEY) =>
  createHmac("sha256", key).update(raw, "utf8").digest("hex");

function setup(overrides: Partial<WebhookIo> = {}) {
  const sent: { name: string; id: string; data: unknown }[][] = [];
  const warn = vi.fn();
  const io: WebhookIo = {
    signingKey: KEY,
    contracts: [CURRENT, PAST],
    send: vi.fn(async (events) => {
      sent.push([...events]);
    }),
    logger: { warn },
    ...overrides,
  };
  return { intake: createWebhookIntake(io), sent, warn, io };
}

describe("createWebhookIntake", () => {
  it("turns a signed request log of an environment contract into one rating event", async () => {
    const { intake, sent } = setup();
    const raw = body([requestLog(PAST)]);

    expect(await intake.receive(raw, sign(raw))).toBe(200);
    expect(sent).toEqual([
      [
        {
          name: "labstrail/rating.requested",
          id: `rating:${REQUEST_ID}`,
          data: { contract: PAST, requestId: REQUEST_ID },
        },
      ],
    ]);
  });

  it("gives a delivery repeated by Alchemy the same event id, which Inngest keeps once", async () => {
    const { intake, sent } = setup();
    const raw = body([requestLog(CURRENT)]);

    await intake.receive(raw, sign(raw));
    await intake.receive(raw, sign(raw));

    expect(sent.map((events) => events.map((event) => event.id))).toEqual([
      [`rating:${REQUEST_ID}`],
      [`rating:${REQUEST_ID}`],
    ]);
  });

  it.each([
    ["no signature", null],
    ["another key's signature", sign(body([requestLog(CURRENT)]), "another-key")],
    ["a signature of the wrong length", "abc123"],
  ])("answers 401 and sends nothing for %s", async (_, signature) => {
    const { intake, sent } = setup();

    expect(await intake.receive(body([requestLog(CURRENT)]), signature)).toBe(401);
    expect(sent).toEqual([]);
  });

  it("checks the signature over the raw body as delivered, not a re-serialized one", async () => {
    const { intake } = setup();
    const raw = body([requestLog(CURRENT)]).replace('"type":"GRAPHQL"', '"type": "GRAPHQL"');

    expect(await intake.receive(raw, sign(raw))).toBe(200);
    expect(await intake.receive(body([requestLog(CURRENT)]), sign(raw))).toBe(401);
  });

  it("sends nothing for another contract's log, another event or a removed log, and answers 200", async () => {
    const { intake, sent } = setup();
    const raw = body([
      requestLog(OTHER),
      pausedLog,
      { ...requestLog(CURRENT, `0x${"cc".repeat(32)}`), removed: true },
    ]);

    expect(await intake.receive(raw, sign(raw))).toBe(200);
    expect(sent).toEqual([]);
  });

  it("sends one event per request when a block holds several", async () => {
    const { intake, sent } = setup();
    const second = `0x${"cc".repeat(32)}` as Hex;
    const raw = body([requestLog(CURRENT), requestLog(CURRENT, second), requestLog(CURRENT)]);

    await intake.receive(raw, sign(raw));

    expect(sent[0]?.map((event) => event.id)).toEqual([`rating:${REQUEST_ID}`, `rating:${second}`]);
  });

  it("answers 400 and logs webhook-unreadable for a signed body that isn't a Notify payload", async () => {
    const { intake, sent, warn } = setup();
    const raw = JSON.stringify({ type: "ADDRESS_ACTIVITY", event: {} });

    expect(await intake.receive(raw, sign(raw))).toBe(400);
    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatch(/^webhook-unreadable: /);
  });

  it("answers 503, so Alchemy delivers again, and logs when Inngest refuses the events", async () => {
    const { intake, warn } = setup({
      send: async () => {
        throw new Error("fetch failed");
      },
    });
    const raw = body([requestLog(CURRENT)]);

    expect(await intake.receive(raw, sign(raw))).toBe(503);
    expect(warn).toHaveBeenCalledWith("webhook-unavailable: inngest: fetch failed");
  });

  it("answers 404 and reads nothing without a signing key", async () => {
    const { intake, io } = setup({ signingKey: undefined });
    const raw = body([requestLog(CURRENT)]);

    expect(await intake.receive(raw, sign(raw))).toBe(404);
    expect(io.send).not.toHaveBeenCalled();
  });

  it("answers 400 and logs webhook-unreadable for a signed body that isn't JSON", async () => {
    const { intake, warn } = setup();
    const raw = "not json";

    expect(await intake.receive(raw, sign(raw))).toBe(400);
    expect(warn).toHaveBeenCalledWith("webhook-unreadable: not JSON");
  });
});

describe("getWebhookIntake", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    inngestSend.mockClear();
  });

  /** The intake built from `env`, in a fresh module so its cached copy is rebuilt. */
  async function intakeFor(env: Record<string, string | undefined>) {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    vi.resetModules();
    const { getWebhookIntake } = await import("./webhook.ts");
    return getWebhookIntake();
  }

  const sentContracts = () =>
    inngestSend.mock.calls.flatMap(([events]) =>
      (events as { data: { contract: string } }[]).map((event) => event.data.contract),
    );

  it("deployed, takes the environment's contracts and never reads LOCAL_RATING_CONTRACT", async () => {
    const staging = ratingControllerDeployments("staging").current.address;
    const intake = await intakeFor({
      APP_ENV: "staging",
      ALCHEMY_WEBHOOK_SIGNING_KEY: KEY,
      LOCAL_RATING_CONTRACT: "left over from local",
    });
    const raw = body([requestLog(staging), requestLog(OTHER, `0x${"01".repeat(32)}`)]);

    expect(await intake.receive(raw, sign(raw))).toBe(200);
    expect(sentContracts()).toEqual([staging]);
  });

  it("locally, takes only the Anvil contract, so post-webhook can check the route", async () => {
    const staging = ratingControllerDeployments("staging").current.address;
    const intake = await intakeFor({
      APP_ENV: "local",
      ALCHEMY_WEBHOOK_SIGNING_KEY: KEY,
      LOCAL_RATING_CONTRACT: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    });
    const anvil = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
    const raw = body([requestLog(anvil), requestLog(staging, `0x${"01".repeat(32)}`)]);

    expect(await intake.receive(raw, sign(raw))).toBe(200);
    expect(sentContracts()).toEqual([anvil]);
  });

  it("answers 404 where no signing key is set, as on a feature preview", async () => {
    const intake = await intakeFor({ APP_ENV: "staging", ALCHEMY_WEBHOOK_SIGNING_KEY: undefined });
    const raw = body([requestLog(CURRENT)]);

    expect(await intake.receive(raw, sign(raw))).toBe(404);
    expect(inngestSend).not.toHaveBeenCalled();
  });
});
