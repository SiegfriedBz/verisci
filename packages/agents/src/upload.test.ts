import { submissionTypedData, targetKaQuads } from "@verisci/core";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { type AgentsEnv, createAgentsEnv } from "./agents-env.ts";
import type { SubmitLimiter } from "./publish/submit-paper.ts";
import { createUploadService, type UploadIo } from "./upload.ts";

const CID = "bafybeicrwkcuhyibpnbzadvjw46tl7s5pl5k5rbf4iaega4x3odats642m";
const GRAPH = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging";
const EVENT_ID = "01K7C2M4X8Q9R1S2T3V4W5Y6Z7";
const NOW_MS = 1_800_000_000_000;
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";

function env(overrides: Record<string, string | undefined> = {}): AgentsEnv {
  return createAgentsEnv({
    APP_ENV: "staging",
    DKG_URL: "http://dkg.test",
    DKG_TOKEN: "secret-admin-token",
    DKG_CONTEXT_GRAPH: GRAPH,
    GROBID_URL: "http://grobid.test",
    PINATA_GATEWAY_URL: "https://example.mypinata.cloud",
    CHAIN_RPC_URL: "http://chain.test",
    PINATA_JWT: "secret-pinata-jwt",
    INNGEST_EVENT_KEY: "secret-event-key",
    INNGEST_SIGNING_KEY: "signkey-test-0123",
    VERCEL_GIT_COMMIT_REF: "develop",
    ...overrides,
  });
}

/** Answers like Pinata, the DKG node and Inngest, by URL. */
function io(runs: unknown[] = [{ status: "Running" }]) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const sent: unknown[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/files/sign"))
      return Response.json({ data: "https://uploads.pinata.cloud/v3/files/x" });
    if (url.includes("/files/public?cid="))
      return Response.json({
        data: { files: [{ id: "file-1", cid: CID, size: 1000, mime_type: "application/pdf" }] },
      });
    if (url.includes("/runs")) return Response.json({ data: runs });
    if (url.startsWith("http://dkg.test"))
      return Response.json({ state: "promoted", reservedUal: UAL });
    return new Response("unexpected", { status: 500 });
  };
  const uploadIo: UploadIo = {
    fetch: fetch as typeof globalThis.fetch,
    send: async (event) => {
      sent.push(event);
      return EVENT_ID;
    },
    now: () => NOW_MS,
  };
  return { uploadIo, requests, sent };
}

const limiter: SubmitLimiter = { check: async () => "allowed", count: async () => {} };

describe("createUploadService", () => {
  it("gives the graph id in the spelling a submission signs", () => {
    expect(createUploadService(env(), io().uploadIo).contextGraph).toBe(
      "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-staging",
    );
  });

  it("signs upload URLs with the Pinata key, for 30 MB and 5 minutes", async () => {
    const { uploadIo, requests } = io();

    expect(await createUploadService(env(), uploadIo).createUploadUrl()).toEqual({
      ok: true,
      url: "https://uploads.pinata.cloud/v3/files/x",
    });
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(
      "Bearer secret-pinata-jwt",
    );
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      date: NOW_MS / 1000,
      expires: 300,
      max_file_size: 30 * 1024 * 1024,
    });
  });

  it("submits a signed paper through Pinata's check to Inngest", async () => {
    const { uploadIo, sent } = io();
    const account = privateKeyToAccount(generatePrivateKey());
    const deadline = BigInt(NOW_MS / 1000 + 600);
    const signature = await account.signTypedData(
      submissionTypedData({ cid: CID, contextGraph: GRAPH, deadline }),
    );

    const result = await createUploadService(env(), uploadIo).submitPaper(
      {
        cid: CID,
        contextGraph: GRAPH,
        deadline: deadline.toString(),
        submitter: account.address,
        signature,
      },
      limiter,
    );

    expect(result).toEqual({ ok: true, cid: CID, eventId: EVENT_ID });
    expect(sent).toHaveLength(1);
  });

  it("reads the asset's state and the run, in the staging branch's Inngest environment", async () => {
    const { uploadIo, requests } = io();

    expect(await createUploadService(env(), uploadIo).readPaper(CID, EVENT_ID)).toEqual({
      asset: { ok: true, state: "stored", reservedUal: UAL },
      run: { ok: true, run: { state: "running" } },
    });
    const runRequest = requests.find((request) => request.url.includes("/runs"));
    expect(runRequest?.url).toBe(`https://api.inngest.com/v1/events/${EVENT_ID}/runs`);
    expect(new Headers(runRequest?.init?.headers).get("x-inngest-env")).toBe("develop");
  });

  it("names why a failed run stopped, from the error it carries", async () => {
    const error = { name: "NonRetriableError", message: "publish-failed:node-unreachable: x" };
    const { uploadIo } = io([{ status: "Failed", output: { error } }]);

    const status = await createUploadService(env(), uploadIo).readPaper(CID, EVENT_ID);

    expect(status.failure).toBe("node-unreachable");
  });

  it("asks the dev server locally, and no run without an event id", async () => {
    const { uploadIo, requests } = io();
    const service = createUploadService(env({ APP_ENV: "local" }), uploadIo);

    await service.readPaper(CID, EVENT_ID);
    expect((await service.readPaper(CID)).run).toBeUndefined();

    expect(requests.filter((request) => request.url.includes("/runs")).map((r) => r.url)).toEqual([
      `http://127.0.0.1:8288/v1/events/${EVENT_ID}/runs`,
    ]);
  });

  it("reads a CID it cannot name as missing, without asking the node", async () => {
    const { uploadIo, requests } = io();

    expect((await createUploadService(env(), uploadIo).readPaper("nope")).asset).toEqual({
      ok: true,
      state: "missing",
    });
    expect(requests).toEqual([]);
  });
});

describe("readPaper on a minted paper", () => {
  const MINTED = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";

  async function mintedNode(signer = privateKeyToAccount(generatePrivateKey())) {
    const deadline = 1_791_639_162n;
    const signature = await signer.signTypedData(
      submissionTypedData({ cid: CID, contextGraph: GRAPH, deadline }),
    );
    const triples = targetKaQuads(
      { title: "Screening VP1", authors: ["Di Liu", "Yuting Xiao"] },
      { cid: CID, submitter: signer.address.toLowerCase(), signature, deadline },
    );
    const paper = `urn:verisci:paper:${CID}`;
    const bindings = triples
      .filter((t) => t.subject === paper)
      .map((t) => {
        const name = triples.find((a) => a.subject === t.object && a.predicate.endsWith("/name"));
        const position = triples.find(
          (a) => a.subject === t.object && a.predicate.endsWith("/position"),
        );
        return name && position
          ? {
              p: t.predicate,
              o: t.object,
              authorName: name.object,
              authorPosition: position.object,
            }
          : { p: t.predicate, o: t.object };
      });
    const fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/query")) return Response.json({ result: { bindings } });
      return Response.json({ state: "published", publishedUal: MINTED, reservedUal: MINTED });
    }) as typeof globalThis.fetch;
    return { fetch, signer };
  }

  it("reads the record back, checks its signature, and names the publisher", async () => {
    const { fetch, signer } = await mintedNode();
    const service = createUploadService(env(), { ...io().uploadIo, fetch });

    const { record } = await service.readPaper(CID);

    expect(record).toMatchObject({
      title: "Screening VP1",
      authors: ["Di Liu", "Yuting Xiao"],
      pdf: `ipfs://${CID}`,
      submitter: signer.address.toLowerCase(),
      deadline: "1791639162",
      signatureCheck: "valid",
      publisher: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
    });
  });

  it("says the record is unavailable when the node does not answer the query", async () => {
    const minted = (async (input: string | URL | Request) =>
      String(input).includes("/api/query")
        ? new Response("down", { status: 503 })
        : Response.json({
            state: "published",
            publishedUal: MINTED,
            reservedUal: MINTED,
          })) as typeof globalThis.fetch;
    const service = createUploadService(env(), { ...io().uploadIo, fetch: minted });

    const status = await service.readPaper(CID);

    expect(status.record).toBeUndefined();
    expect(status.recordProblem).toBe("unavailable");
  });

  it("says the record is unreadable when the node answers no usable record", async () => {
    const empty = (async (input: string | URL | Request) =>
      String(input).includes("/api/query")
        ? Response.json({ result: { bindings: [] } })
        : Response.json({
            state: "published",
            publishedUal: MINTED,
            reservedUal: MINTED,
          })) as typeof globalThis.fetch;
    const service = createUploadService(env(), { ...io().uploadIo, fetch: empty });

    expect((await service.readPaper(CID)).recordProblem).toBe("unreadable");
  });

  it("gives no record for a paper that is not minted", async () => {
    const { uploadIo } = io();

    expect((await createUploadService(env(), uploadIo).readPaper(CID)).record).toBeUndefined();
  });
});
