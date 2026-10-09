import { describe, expect, it } from "vitest";
import { createDkgClient } from "./client.ts";
import type { Quad } from "./types.ts";

const AGENT = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3";
const GRAPH = `${AGENT}/verisci-staging`;
const TOKEN = "secret-admin-token";
const NAME = "verisci-rka-0xabc";
const ASSET = `/api/knowledge-assets/${NAME}`;
const RESERVED = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const QUADS: Quad[] = [
  { subject: "urn:verisci:x", predicate: "http://schema.org/ratingValue", object: '"7"' },
];

type Reply = { status: number; body?: unknown } | "network-error" | "hang";

interface Call {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
}

const GRAPHS = "GET /api/context-graph/list";
const graphList = (id: string, subscribed = true): Reply => ({
  status: 200,
  body: {
    contextGraphs: [
      { id: "agents", subscribed: true },
      { id, subscribed },
    ],
  },
});

/**
 * A fake node: each route (`METHOD /path`) answers its replies in order, repeating the last
 * one. Records every call. An unknown route fails the test. The graph list serves `GRAPH`
 * unless a test gives its own.
 */
function fakeNode(routes: Record<string, Reply[]>, options: { timeoutMs?: number } = {}) {
  routes = { [GRAPHS]: [graphList(GRAPH)], ...routes };
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname;
    calls.push({
      method,
      path: `${path}${url.search}`,
      headers: new Headers(init?.headers),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    const replies = routes[`${method} ${path}`];
    if (replies === undefined || replies.length === 0)
      throw new Error(`no route ${method} ${path}`);
    const reply = replies.length > 1 ? replies.shift() : replies[0];
    if (reply === "network-error") throw new TypeError("fetch failed");
    if (reply === "hang") {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }
    if (reply === undefined) throw new Error("no reply");
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  };
  const client = createDkgClient({
    url: "http://127.0.0.1:9200/",
    token: TOKEN,
    contextGraphId: GRAPH,
    fetch,
    ...options,
  });
  const writes = () => calls.filter((call) => call.method === "POST").map((call) => call.path);
  return { client, calls, writes };
}

const missing: Reply = { status: 404, body: { error: "not found" } };
const created: Reply = { status: 200, body: { state: "created", reservedUal: RESERVED } };
const promoted: Reply = { status: 200, body: { state: "promoted", reservedUal: RESERVED } };
const published: Reply = {
  status: 200,
  body: { state: "published", reservedUal: RESERVED, publishedUal: RESERVED.toUpperCase() },
};
const conflict = (code: string): Reply => ({ status: 409, body: { code, error: "refused" } });

describe("readAsset", () => {
  it.each([
    ["not listed", graphList(`${AGENT}/other`)],
    ["listed but not subscribed", graphList(GRAPH, false)],
  ])("reads a 404 as graph-not-served when the graph is %s", async (_, list) => {
    const { client } = fakeNode({ [`GET ${ASSET}`]: [missing], [GRAPHS]: [list] });

    expect(await client.readAsset(NAME)).toEqual({ ok: false, reason: "graph-not-served" });
  });

  it("checks the graph list on every 404, since a restart can drop the graph", async () => {
    const { client } = fakeNode({
      [`GET ${ASSET}`]: [missing],
      [GRAPHS]: [graphList(GRAPH), graphList(`${AGENT}/other`)],
    });

    expect(await client.readAsset(NAME)).toEqual({ ok: true, state: "missing" });
    expect(await client.readAsset(NAME)).toEqual({ ok: false, reason: "graph-not-served" });
  });

  it("matches the graph's address in any case but its name exactly", async () => {
    const address = fakeNode({
      [`GET ${ASSET}`]: [missing],
      [GRAPHS]: [graphList(GRAPH.toLowerCase())],
    });
    const name = fakeNode({
      [`GET ${ASSET}`]: [missing],
      [GRAPHS]: [graphList(`${AGENT}/Verisci-Staging`)],
    });

    expect(await address.client.readAsset(NAME)).toEqual({ ok: true, state: "missing" });
    expect(await name.client.readAsset(NAME)).toEqual({ ok: false, reason: "graph-not-served" });
  });

  it("reports a graph list it cannot read", async () => {
    const odd = fakeNode({ [`GET ${ASSET}`]: [missing], [GRAPHS]: [{ status: 200, body: {} }] });
    const down = fakeNode({ [`GET ${ASSET}`]: [missing], [GRAPHS]: ["network-error"] });

    expect(await odd.client.readAsset(NAME)).toEqual({
      ok: false,
      reason: "unexpected",
      status: 200,
    });
    expect(await down.client.readAsset(NAME)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reads a name never stored as missing", async () => {
    const { client } = fakeNode({ [`GET ${ASSET}`]: [missing] });

    expect(await client.readAsset(NAME)).toEqual({ ok: true, state: "missing" });
  });

  it("maps the node's states to draft, stored and minted", async () => {
    const draft = fakeNode({ [`GET ${ASSET}`]: [created] });
    const stored = fakeNode({ [`GET ${ASSET}`]: [promoted] });
    const minted = fakeNode({ [`GET ${ASSET}`]: [published] });

    expect(await draft.client.readAsset(NAME)).toEqual({ ok: true, state: "draft" });
    expect(await stored.client.readAsset(NAME)).toEqual({
      ok: true,
      state: "stored",
      reservedUal: RESERVED,
    });
    expect(await minted.client.readAsset(NAME)).toEqual({
      ok: true,
      state: "minted",
      ual: RESERVED,
    });
  });

  it("sends the token, the full graph id and the encoded name", async () => {
    const { client, calls } = fakeNode({ "GET /api/knowledge-assets/a%20b": [missing] });

    await client.readAsset("a b");

    const [call] = calls;
    expect(call?.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(call?.path).toBe(
      `/api/knowledge-assets/a%20b?contextGraphId=${encodeURIComponent(GRAPH)}`,
    );
  });
});

describe("storeAsset", () => {
  it("creates then shares a missing name", async () => {
    const { client, calls, writes } = fakeNode({
      [`GET ${ASSET}`]: [missing, promoted],
      "POST /api/knowledge-assets": [{ status: 201, body: { status: "wm-sealed" } }],
      [`POST ${ASSET}/swm/share`]: [{ status: 200, body: { swmShared: true } }],
    });

    const result = await client.storeAsset(NAME, QUADS);

    expect(result).toEqual({ ok: true, state: "stored", reservedUal: RESERVED });
    expect(writes()).toEqual(["/api/knowledge-assets", `${ASSET}/swm/share`]);
    expect(calls.find((call) => call.path === "/api/knowledge-assets")?.body).toEqual({
      contextGraphId: GRAPH,
      name: NAME,
      quads: QUADS,
    });
    expect(calls.find((call) => call.path === `${ASSET}/swm/share`)?.body).toEqual({
      contextGraphId: GRAPH,
    });
  });

  it("only shares a draft, without sending the new quads", async () => {
    const { client, writes } = fakeNode({
      [`GET ${ASSET}`]: [created, promoted],
      [`POST ${ASSET}/swm/share`]: [{ status: 200, body: { swmShared: true } }],
    });

    const result = await client.storeAsset(NAME, QUADS);

    expect(result).toEqual({ ok: true, state: "stored", reservedUal: RESERVED });
    expect(writes()).toEqual([`${ASSET}/swm/share`]);
  });

  it.each([
    ["stored", promoted, { ok: true, state: "stored", reservedUal: RESERVED }],
    ["minted", published, { ok: true, state: "minted", ual: RESERVED }],
  ])("sends no write for a %s name and returns its state", async (_, reply, expected) => {
    const { client, writes } = fakeNode({ [`GET ${ASSET}`]: [reply] });

    expect(await client.storeAsset(NAME, QUADS)).toEqual(expected);
    expect(writes()).toEqual([]);
  });

  it.each([
    [
      "stored",
      "KA_ASSERTION_ALREADY_FINALIZED",
      promoted,
      { state: "stored", reservedUal: RESERVED },
    ],
    ["minted", "KA_WM_LIFECYCLE_REQUIRED", published, { state: "minted", ual: RESERVED }],
  ])("returns %s when a racing store got there first (%s)", async (_, code, reply, expected) => {
    const { client, writes } = fakeNode({
      [`GET ${ASSET}`]: [missing, reply],
      "POST /api/knowledge-assets": [conflict(code)],
    });

    expect(await client.storeAsset(NAME, QUADS)).toEqual({ ok: true, ...expected });
    expect(writes()).toEqual(["/api/knowledge-assets"]);
  });

  it("fails when the share is refused and the asset stays a draft", async () => {
    const { client } = fakeNode({
      [`GET ${ASSET}`]: [created],
      [`POST ${ASSET}/swm/share`]: [conflict("SHARE_REFUSED")],
    });

    expect(await client.storeAsset(NAME, QUADS)).toEqual({
      ok: false,
      reason: "unexpected",
      status: 409,
      code: "SHARE_REFUSED",
    });
  });

  it("goes on from the state when a racing store already sealed the name", async () => {
    const { client, writes } = fakeNode({
      [`GET ${ASSET}`]: [missing, created, promoted],
      "POST /api/knowledge-assets": [conflict("KA_ASSERTION_ALREADY_FINALIZED")],
      [`POST ${ASSET}/swm/share`]: [{ status: 200, body: { swmShared: true } }],
    });

    const result = await client.storeAsset(NAME, QUADS);

    expect(result).toEqual({ ok: true, state: "stored", reservedUal: RESERVED });
    expect(writes()).toEqual(["/api/knowledge-assets", `${ASSET}/swm/share`]);
  });
});

describe("startMint", () => {
  it("sends no mint for a minted name", async () => {
    const { client, writes } = fakeNode({ [`GET ${ASSET}`]: [published] });

    expect(await client.startMint(NAME)).toEqual({ ok: true, state: "minted", ual: RESERVED });
    expect(writes()).toEqual([]);
  });

  it("returns the normalized UAL when the mint answers in time", async () => {
    const { client, calls } = fakeNode({
      [`GET ${ASSET}`]: [promoted],
      [`POST ${ASSET}/vm/publish`]: [
        { status: 200, body: { status: "confirmed", ual: ` ${RESERVED.toUpperCase()} ` } },
      ],
    });

    expect(await client.startMint(NAME)).toEqual({ ok: true, state: "minted", ual: RESERVED });
    expect(calls.find((call) => call.path === `${ASSET}/vm/publish`)?.body).toEqual({
      contextGraphId: GRAPH,
    });
  });

  it("stops listening after listenMs and reports the mint as started", async () => {
    const { client } = fakeNode({
      [`GET ${ASSET}`]: [promoted],
      [`POST ${ASSET}/vm/publish`]: ["hang"],
    });

    expect(await client.startMint(NAME, { listenMs: 20 })).toEqual({
      ok: true,
      state: "minting",
    });
  });

  it.each([
    ["a 409", conflict("PUBLISH_NOT_FULL_SHARE")],
    ["a 500", { status: 500, body: { error: "KaIdAlreadyMinted" } }],
  ])("reads the state after %s: minted gives the UAL", async (_, reply) => {
    const { client } = fakeNode({
      [`GET ${ASSET}`]: [promoted, published],
      [`POST ${ASSET}/vm/publish`]: [reply as Reply],
    });

    expect(await client.startMint(NAME)).toEqual({ ok: true, state: "minted", ual: RESERVED });
  });

  it.each([
    ["a 409", conflict("PUBLISH_NOT_FULL_SHARE")],
    ["a 500", { status: 500, body: { error: "KaIdAlreadyMinted" } }],
  ])("reads the state after %s: still stored means a mint may be in flight", async (_, reply) => {
    const { client } = fakeNode({
      [`GET ${ASSET}`]: [promoted],
      [`POST ${ASSET}/vm/publish`]: [reply as Reply],
    });

    expect(await client.startMint(NAME)).toEqual({ ok: true, state: "minting" });
  });

  it.each([
    ["missing", missing],
    ["draft", created],
  ])("refuses a %s name and sends no mint", async (_, reply) => {
    const { client, writes } = fakeNode({ [`GET ${ASSET}`]: [reply] });

    expect(await client.startMint(NAME)).toEqual({ ok: false, reason: "not-stored" });
    expect(writes()).toEqual([]);
  });

  it.each(["storage_ack_insufficient", "CORE_TEMPORARILY_UNAVAILABLE"])(
    "asks for a later retry on a quorum failure (%s)",
    async (code) => {
      const { client } = fakeNode({
        [`GET ${ASSET}`]: [promoted],
        [`POST ${ASSET}/vm/publish`]: [{ status: 503, body: { error: `publish failed: ${code}` } }],
      });

      expect(await client.startMint(NAME)).toMatchObject({ ok: false, reason: "retry-later" });
    },
  );
});

describe("failures shared by every call", () => {
  it("reports a read that times out as unreachable", async () => {
    const { client } = fakeNode({ [`GET ${ASSET}`]: ["hang"] }, { timeoutMs: 20 });

    expect(await client.readAsset(NAME)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports a node that cannot be reached", async () => {
    const { client } = fakeNode({ [`GET ${ASSET}`]: ["network-error"] });

    expect(await client.readAsset(NAME)).toEqual({ ok: false, reason: "unreachable" });
  });

  it.each([401, 403])("reports %i as unauthorized", async (status) => {
    const { client } = fakeNode({ [`GET ${ASSET}`]: [{ status, body: { error: "no" } }] });

    expect(await client.storeAsset(NAME, QUADS)).toMatchObject({
      ok: false,
      reason: "unauthorized",
      status,
    });
  });

  it("reports any other answer as unexpected, with its status and code, never the token", async () => {
    const { client } = fakeNode({
      [`GET ${ASSET}`]: [{ status: 400, body: { code: "BAD_INPUT", error: `token ${TOKEN}` } }],
    });

    const result = await client.readAsset(NAME);

    expect(result).toEqual({ ok: false, reason: "unexpected", status: 400, code: "BAD_INPUT" });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("reports a body it cannot read as unexpected", async () => {
    const { client } = fakeNode({ [`GET ${ASSET}`]: [{ status: 200, body: { state: "odd" } }] });

    expect(await client.readAsset(NAME)).toEqual({ ok: false, reason: "unexpected", status: 200 });
  });
});
