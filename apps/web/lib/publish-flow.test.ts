import type { SubmitResult } from "@verisci/workflows";
import { describe, expect, it } from "vitest";
import { type FlowDeps, type Phase, publishFile, uploadToSignedUrl } from "./publish-flow.ts";

const CID = "bafybeicrwkcuhyibpnbzadvjw46tl7s5pl5k5rbf4iaega4x3odats642m";
const CID_V0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const GRAPH = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-staging";
const ADDRESS = "0x1111111111111111111111111111111111111111";
const NOW_MS = 1_800_000_000_000;

function pdf(size = 10, type = "application/pdf") {
  return new File([new Uint8Array(size)], "paper.pdf", { type });
}

function deps(overrides: Partial<FlowDeps> = {}) {
  const phases: Phase[] = [];
  const signed: unknown[] = [];
  const submitted: unknown[] = [];
  const flowDeps: FlowDeps = {
    contextGraph: GRAPH,
    maxBytes: 1000,
    signatureLifetimeS: 600,
    now: () => NOW_MS,
    requestUpload: async () => ({ ok: true, url: "https://uploads.pinata.cloud/v3/files/x" }),
    upload: async () => CID,
    sign: async (typedData) => {
      signed.push(typedData);
      return { ok: true, address: ADDRESS, signature: "0xabcd" };
    },
    submit: async (input): Promise<SubmitResult> => {
      submitted.push(input);
      return { ok: true, cid: CID, eventId: "01K7C2M4X8Q9R1S2T3V4W5Y6Z7" };
    },
    onPhase: (phase) => phases.push(phase),
    ...overrides,
  };
  return { flowDeps, phases, signed, submitted };
}

describe("publishFile", () => {
  it("uploads, signs the canonical CID with a 10-minute deadline, and submits", async () => {
    const { flowDeps, phases, signed, submitted } = deps({ upload: async () => CID_V0 });

    const result = await publishFile(pdf(), flowDeps);

    expect(result).toEqual({ ok: true, cid: CID, eventId: "01K7C2M4X8Q9R1S2T3V4W5Y6Z7" });
    expect(phases).toEqual(["uploading", "signing", "submitting"]);
    const message = (signed[0] as { message: { cid: string; deadline: bigint } }).message;
    expect(message.cid).toMatch(/^bafy/);
    expect(message.deadline).toBe(BigInt(NOW_MS / 1000 + 600));
    expect(submitted).toEqual([
      {
        cid: message.cid,
        contextGraph: GRAPH,
        deadline: String(NOW_MS / 1000 + 600),
        submitter: ADDRESS,
        signature: "0xabcd",
      },
    ]);
  });

  it("refuses a file that is not a PDF, or too large, before uploading", async () => {
    const { flowDeps, phases } = deps();

    expect(await publishFile(pdf(10, "text/plain"), flowDeps)).toEqual({
      ok: false,
      problem: "wrong-file",
    });
    expect(await publishFile(pdf(1001), flowDeps)).toEqual({ ok: false, problem: "too-large" });
    expect(phases).toEqual([]);
  });

  it("reads the header of a file whose type the picker left empty", async () => {
    const { flowDeps, phases } = deps();
    const untyped = (bytes: string) => new File([bytes], "paper", { type: "" });

    expect((await publishFile(untyped("%PDF-1.7 rest"), flowDeps)).ok).toBe(true);
    phases.length = 0;
    expect(await publishFile(untyped("PK zip"), flowDeps)).toEqual({
      ok: false,
      problem: "wrong-file",
    });
    expect(await publishFile(untyped("x%PDF-1.7"), flowDeps)).toEqual({
      ok: false,
      problem: "wrong-file",
    });
    expect(phases).toEqual([]);
  });

  it("reads an untyped file the browser cannot read as unavailable", async () => {
    const { flowDeps } = deps();
    const unreadable = new File(["%PDF-"], "paper", { type: "" });
    unreadable.slice = () => {
      throw new DOMException("gone", "NotReadableError");
    };

    expect(await publishFile(unreadable, flowDeps)).toEqual({ ok: false, problem: "unavailable" });
  });

  it("stops when no upload URL is given", async () => {
    const { flowDeps } = deps({
      requestUpload: async () => ({ ok: false, reason: "rate-limited" }),
    });

    expect(await publishFile(pdf(), flowDeps)).toEqual({ ok: false, problem: "rate-limited" });
  });

  it("stops when the upload fails or gives a CID it cannot read", async () => {
    expect(await publishFile(pdf(), deps({ upload: async () => undefined }).flowDeps)).toEqual({
      ok: false,
      problem: "upload-failed",
    });
    expect(await publishFile(pdf(), deps({ upload: async () => "nonsense" }).flowDeps)).toEqual({
      ok: false,
      problem: "upload-failed",
    });
  });

  it("stops, submitting nothing, when the visitor declines to sign", async () => {
    const { flowDeps, submitted } = deps({ sign: async () => ({ ok: false }) });

    expect(await publishFile(pdf(), flowDeps)).toEqual({
      ok: false,
      problem: "signature-declined",
    });
    expect(submitted).toEqual([]);
  });

  it("reports a paper already published, with no run to follow", async () => {
    const { flowDeps } = deps({
      submit: async () => ({ ok: true, cid: CID, ual: "did:dkg:base:84532/0xabc/6" }),
    });

    expect(await publishFile(pdf(), flowDeps)).toEqual({
      ok: true,
      cid: CID,
      alreadyPublished: true,
    });
  });

  it("passes on the server's refusal", async () => {
    const { flowDeps } = deps({ submit: async () => ({ ok: false, reason: "not-pinned" }) });

    expect(await publishFile(pdf(), flowDeps)).toEqual({ ok: false, problem: "not-pinned" });
  });

  it("reads anything thrown on the way as unavailable", async () => {
    const { flowDeps } = deps({ requestUpload: () => Promise.reject(new Error("offline")) });

    expect(await publishFile(pdf(), flowDeps)).toEqual({ ok: false, problem: "unavailable" });
  });
});

describe("uploadToSignedUrl", () => {
  it("posts the file to Pinata's public network and returns the CID it answers", async () => {
    const requests: { url: string; body: FormData }[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body as FormData });
      return Response.json({ data: { cid: CID } });
    }) as typeof globalThis.fetch;

    expect(await uploadToSignedUrl("https://uploads.pinata.cloud/v3/files/x", pdf(), fetch)).toBe(
      CID,
    );
    expect(requests[0]?.body.get("network")).toBe("public");
    expect(requests[0]?.body.get("file")).toBeInstanceOf(File);
  });

  it("returns undefined when Pinata refuses the file", async () => {
    const fetch = (async () => new Response("no", { status: 400 })) as typeof globalThis.fetch;

    expect(await uploadToSignedUrl("https://x", pdf(), fetch)).toBeUndefined();
  });
});
