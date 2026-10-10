import type { PaperStatus, SubmitLimiter, UploadService } from "@verisci/agents";
import { describe, expect, it } from "vitest";
import type { Counter } from "./limits.ts";
import { clientIp, readProgress, requestUploadUrl, sendSubmission } from "./upload-actions.ts";

const CID = "bafybeicrwkcuhyibpnbzadvjw46tl7s5pl5k5rbf4iaega4x3odats642m";
const EVENT_ID = "01K7C2M4X8Q9R1S2T3V4W5Y6Z7";

function fakeService(overrides: Partial<UploadService> = {}) {
  const calls = { urls: 0, submitted: [] as unknown[], read: [] as unknown[] };
  const service: UploadService = {
    contextGraph: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-staging",
    createUploadUrl: async () => {
      calls.urls++;
      return { ok: true, url: "https://uploads.pinata.cloud/v3/files/x" };
    },
    submitPaper: async (input) => {
      calls.submitted.push(input);
      return { ok: true, cid: CID, eventId: EVENT_ID };
    },
    readPaper: async (cid, eventId): Promise<PaperStatus> => {
      calls.read.push([cid, eventId]);
      return { asset: { ok: true, state: "stored", reservedUal: "x" }, run: undefined };
    },
    ...overrides,
  };
  return { service, calls };
}

function fakeCounter(answer: "allowed" | "limited" | "unavailable"): Counter & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    check: async () => answer,
    count: async () => {},
    take: async (key) => {
      keys.push(key);
      return answer;
    },
  };
}

describe("requestUploadUrl", () => {
  it("signs a URL for a connection under its limit, counting it by IP", async () => {
    const { service } = fakeService();
    const urls = fakeCounter("allowed");

    expect(await requestUploadUrl("203.0.113.7", { service, urls })).toEqual({
      ok: true,
      url: "https://uploads.pinata.cloud/v3/files/x",
    });
    expect(urls.keys).toEqual(["203.0.113.7"]);
  });

  it("refuses a connection over its limit, signing nothing", async () => {
    const { service, calls } = fakeService();

    expect(await requestUploadUrl("ip", { service, urls: fakeCounter("limited") })).toEqual({
      ok: false,
      reason: "rate-limited",
    });
    expect(calls.urls).toBe(0);
  });

  it("answers unavailable when the limits cannot be read, or Pinata does not sign", async () => {
    const { service } = fakeService({
      createUploadUrl: async () => ({ ok: false, reason: "unavailable" }),
    });

    expect(await requestUploadUrl("ip", { service, urls: fakeCounter("unavailable") })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await requestUploadUrl("ip", { service, urls: fakeCounter("allowed") })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("sendSubmission", () => {
  it("passes the submission and the per-address limiter to the service", async () => {
    const { service, calls } = fakeService();
    const submissions: SubmitLimiter = fakeCounter("allowed");
    const input = { cid: CID };

    expect(await sendSubmission(input, { service, submissions })).toEqual({
      ok: true,
      cid: CID,
      eventId: EVENT_ID,
    });
    expect(calls.submitted).toEqual([input]);
  });
});

describe("readProgress", () => {
  it("reads the paper by its canonical CID and maps it to a stage", async () => {
    const { service, calls } = fakeService();

    expect(await readProgress(CID, EVENT_ID, service)).toEqual({ stage: "minting" });
    expect(calls.read).toEqual([[CID, EVENT_ID]]);
  });

  it("passes on the record of a minted paper", async () => {
    const record = {
      title: "T",
      authors: [],
      pdf: `ipfs://${CID}`,
      submitter: "0xabc",
      signature: "0x12",
      deadline: "1",
      signatureCheck: "valid",
      publisher: "0xd701",
    } as const;
    const { service } = fakeService({
      readPaper: async () => ({
        asset: { ok: true, state: "minted", ual: "did:dkg:base:84532/0xd701/6" },
        run: undefined,
        record,
      }),
    });

    expect(await readProgress(CID, undefined, service)).toEqual({
      stage: "published",
      ual: "did:dkg:base:84532/0xd701/6",
      record,
    });
  });

  it("passes on why a minted paper's record could not be read", async () => {
    const { service } = fakeService({
      readPaper: async () => ({
        asset: { ok: true, state: "minted", ual: "did:dkg:base:84532/0xd701/6" },
        run: undefined,
        recordProblem: "unavailable",
      }),
    });

    expect(await readProgress(CID, undefined, service)).toEqual({
      stage: "published",
      ual: "did:dkg:base:84532/0xd701/6",
      recordProblem: "unavailable",
    });
  });

  it("reads a CID it cannot canonicalize as not-found, without asking", async () => {
    const { service, calls } = fakeService();

    expect(await readProgress("not-a-cid", undefined, service)).toEqual({ stage: "not-found" });
    expect(calls.read).toEqual([]);
  });

  it("ignores an event id that is not a ULID", async () => {
    const { service, calls } = fakeService();

    await readProgress(CID, "../x", service);

    expect(calls.read).toEqual([[CID, undefined]]);
  });
});

describe("clientIp", () => {
  it("takes the first address Vercel forwards, or unknown", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
