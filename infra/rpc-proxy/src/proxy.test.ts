import { describe, expect, it } from "vitest";
import { createDailyBudget } from "./budget.ts";
import { createProxy, type JsonRpcResponse, type Post, type UpstreamReply } from "./proxy.ts";

const ALCHEMY = "https://alchemy.test";
const PUBLIC = ["https://public-a.test", "https://public-b.test"] as const;
const HEAD = 100_000;

interface Call {
  readonly url: string;
  readonly method: string;
  readonly params: readonly unknown[];
}

interface LogFilter {
  readonly fromBlock: string;
  readonly toBlock: string;
}

type Answer = (call: Call) => UpstreamReply;

const hex = (n: number) => `0x${n.toString(16)}`;

/** A fake log per block, so merged results show which blocks were fetched. */
function logsFor(filter: LogFilter): number[] {
  const out: number[] = [];
  for (let b = Number(filter.fromBlock); b <= Number(filter.toBlock); b++) out.push(b);
  return out;
}

/** Every endpoint answers the head and serves logs; `answer` overrides. */
function setup(
  answer: Answer = () => ({ result: "ok" }),
  limit = 24_000,
  headReply: UpstreamReply = { result: hex(HEAD) },
) {
  let now = 1_000_000;
  const calls: Call[] = [];
  const post: Post = async (url, body) => {
    const { method, params = [] } = body as { method: string; params?: unknown[] };
    const call = { url, method, params };
    calls.push(call);
    if (method === "eth_blockNumber") return headReply;
    return answer(call);
  };
  const proxy = createProxy({
    alchemyUrl: ALCHEMY,
    publicUrls: PUBLIC,
    budget: createDailyBudget(limit, () => now),
    post,
    now: () => now,
    sleep: async () => {},
    logCacheMax: 3,
  });
  return {
    proxy,
    calls,
    advance: (ms: number) => {
      now += ms;
    },
    callsOf: (method: string) => calls.filter((c) => c.method === method),
  };
}

const getLogs = (from: number, to: number | string, id: unknown = 1) => ({
  jsonrpc: "2.0",
  id,
  method: "eth_getLogs",
  params: [
    { address: "0xabc", fromBlock: hex(from), toBlock: typeof to === "string" ? to : hex(to) },
  ],
});

const servesLogs: Answer = (c) =>
  c.method === "eth_getLogs" ? { result: logsFor(c.params[0] as LogFilter) } : { result: "ok" };

const spanOf = (c: Call) => {
  const f = c.params[0] as LogFilter;
  return Number(f.toBlock) - Number(f.fromBlock) + 1;
};

describe("routing", () => {
  it("sends an ordinary call to a public endpoint first", async () => {
    const { proxy, calls } = setup();
    const res = await proxy.handle({ jsonrpc: "2.0", id: 7, method: "eth_call", params: [{}] });
    expect(res).toEqual({ jsonrpc: "2.0", id: 7, result: "ok" });
    expect(calls.map((c) => c.url)).toEqual([PUBLIC[0]]);
  });

  it("spreads simultaneous calls over the public endpoints", async () => {
    const waiting: (() => void)[] = [];
    const calls: string[] = [];
    const proxy = createProxy({
      alchemyUrl: ALCHEMY,
      publicUrls: PUBLIC,
      budget: createDailyBudget(24_000, () => 0),
      post: (url) => {
        calls.push(url);
        return new Promise<UpstreamReply>((r) => waiting.push(() => r({ result: "ok" })));
      },
      now: () => 0,
      sleep: async () => {},
    });
    const pending = Array.from({ length: 6 }, (_, i) =>
      proxy.handle({ jsonrpc: "2.0", id: i, method: "eth_gasPrice", params: [i] }),
    );
    expect(calls.filter((u) => u === PUBLIC[0])).toHaveLength(3);
    expect(calls.filter((u) => u === PUBLIC[1])).toHaveLength(3);
    for (const done of waiting) done();
    await Promise.all(pending);
  });

  it("asks Alchemy only after every public endpoint failed", async () => {
    const { proxy, calls } = setup((c) =>
      c.url === ALCHEMY ? { result: "from alchemy" } : { error: { message: "HTTP 503" } },
    );
    const res = await proxy.handle({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{}] });
    expect(res.result).toBe("from alchemy");
    expect(calls.map((c) => c.url)).toEqual([...PUBLIC, ALCHEMY]);
  });

  it("moves a throttled endpoint aside and lets it cool down", async () => {
    const { proxy, calls, advance } = setup((c) =>
      c.url === PUBLIC[0] ? { error: { message: "HTTP 429 throttled" } } : { result: "ok" },
    );
    await proxy.handle({ jsonrpc: "2.0", id: 1, method: "eth_call", params: ["a"] });
    await proxy.handle({ jsonrpc: "2.0", id: 2, method: "eth_call", params: ["b"] });
    expect(calls.map((c) => c.url)).toEqual([PUBLIC[0], PUBLIC[1], PUBLIC[1]]);
    advance(2_000);
    await proxy.handle({ jsonrpc: "2.0", id: 3, method: "eth_call", params: ["c"] });
    expect(calls[3]?.url).toBe(PUBLIC[0]);
  });
});

describe("eth_getLogs", () => {
  it("sends a range of up to 2,000 blocks as one public request", async () => {
    const { proxy, callsOf } = setup(servesLogs);
    const res = await proxy.handle(getLogs(1_000, 2_999));
    expect(res.result).toHaveLength(2_000);
    expect(callsOf("eth_getLogs").map((c) => c.url)).toEqual([PUBLIC[0]]);
  });

  it("splits a larger range into 2,000-block windows, merged in order", async () => {
    const { proxy, callsOf } = setup(servesLogs);
    const res = await proxy.handle(getLogs(0, 4_999));
    expect(callsOf("eth_getLogs").map(spanOf)).toEqual([2_000, 2_000, 1_000]);
    expect(res.result).toEqual(Array.from({ length: 5_000 }, (_, i) => i));
  });

  it("splits a refused window into smaller public windows before trying Alchemy", async () => {
    const { proxy, callsOf } = setup((c) =>
      c.method === "eth_getLogs" && spanOf(c) > 500
        ? { error: { message: "block range too large" } }
        : servesLogs(c),
    );
    const res = await proxy.handle(getLogs(0, 1_999));
    expect(res.result).toEqual(Array.from({ length: 2_000 }, (_, i) => i));
    expect(callsOf("eth_getLogs").some((c) => c.url === ALCHEMY)).toBe(false);
  });

  it("falls back to 10-block Alchemy slices within the daily budget", async () => {
    const { proxy, callsOf } = setup(
      (c) => (c.url === ALCHEMY ? servesLogs(c) : { error: { message: "range too large" } }),
      240,
    );
    const res = await proxy.handle(getLogs(0, 99));
    expect(res.result).toEqual(Array.from({ length: 100 }, (_, i) => i));
    const alchemy = callsOf("eth_getLogs").filter((c) => c.url === ALCHEMY);
    expect(alchemy.map(spanOf)).toEqual(Array(10).fill(10));
  });

  it("answers with an error once the Alchemy budget is used up", async () => {
    const { proxy, calls } = setup(
      (c) => (c.url === ALCHEMY ? servesLogs(c) : { error: { message: "range too large" } }),
      120,
    );
    const res = await proxy.handle(getLogs(0, 99, 42));
    expect(res).toMatchObject({ jsonrpc: "2.0", id: 42, error: { code: -32000 } });
    expect(calls.filter((c) => c.url === ALCHEMY)).toHaveLength(5);
  });

  it("never asks for blocks past the chain head", async () => {
    const { proxy, callsOf } = setup(servesLogs);
    await proxy.handle(getLogs(HEAD - 10, HEAD + 500));
    const asked = callsOf("eth_getLogs").map((c) => Number((c.params[0] as LogFilter).toBlock));
    expect(Math.max(...asked)).toBe(HEAD);
  });

  it("reads a missing fromBlock as the chain head, as JSON-RPC does", async () => {
    const { proxy, callsOf } = setup(servesLogs);
    const res = await proxy.handle({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{}] });
    expect(res.result).toEqual([HEAD]);
    expect(callsOf("eth_getLogs").map(spanOf)).toEqual([1]);
  });

  it("answers an invalid block tag with an invalid-params error", async () => {
    const { proxy } = setup(servesLogs);
    expect(await proxy.handle(getLogs(0, "soon"))).toMatchObject({
      id: 1,
      error: { code: -32602 },
    });
  });

  it("fails an outage instead of splitting the range or asking Alchemy", async () => {
    const { proxy, callsOf } = setup((c) =>
      c.method === "eth_getLogs" && c.url !== ALCHEMY
        ? { error: { message: "HTTP 503" } }
        : servesLogs(c),
    );
    const res = await proxy.handle(getLogs(0, 1_999));
    expect(res).toMatchObject({ error: { code: -32000 } });
    expect(new Set(callsOf("eth_getLogs").map(spanOf))).toEqual(new Set([2_000]));
    expect(callsOf("eth_getLogs").some((c) => c.url === ALCHEMY)).toBe(false);
  });

  it("stops asking Alchemy for slices once one has failed", async () => {
    const { proxy, callsOf } = setup((c) =>
      c.url === ALCHEMY
        ? { error: { message: "execution reverted" } }
        : { error: { message: "range too large" } },
    );
    const res = await proxy.handle(getLogs(0, 99));
    expect(res).toMatchObject({ error: { code: -32000 } });
    expect(callsOf("eth_getLogs").filter((c) => c.url === ALCHEMY).length).toBeLessThanOrEqual(4);
  });

  it("answers with an error when the chain head is unavailable", async () => {
    const { proxy } = setup(servesLogs, 24_000, { result: null });
    expect(await proxy.handle(getLogs(0, 9, 3))).toMatchObject({
      id: 3,
      error: { code: -32000, message: "chain head unavailable" },
    });
  });

  it("reads 'latest' as the chain head", async () => {
    const { proxy } = setup(servesLogs);
    const res = await proxy.handle(getLogs(HEAD - 4, "latest"));
    expect(res.result).toEqual([HEAD - 4, HEAD - 3, HEAD - 2, HEAD - 1, HEAD]);
  });

  it("answers an empty list when the range starts past the head", async () => {
    const { proxy, callsOf } = setup(servesLogs);
    const res = await proxy.handle(getLogs(HEAD + 1, HEAD + 10));
    expect(res.result).toEqual([]);
    expect(callsOf("eth_getLogs")).toHaveLength(0);
  });

  it("caches old windows, keeping at most a fixed number", async () => {
    const { proxy, callsOf } = setup(servesLogs);
    await proxy.handle(getLogs(0, 9));
    await proxy.handle(getLogs(0, 9));
    expect(callsOf("eth_getLogs")).toHaveLength(1);
    await proxy.handle(getLogs(10, 19));
    await proxy.handle(getLogs(20, 29));
    await proxy.handle(getLogs(30, 39));
    await proxy.handle(getLogs(0, 9));
    expect(callsOf("eth_getLogs")).toHaveLength(5);
  });

  it("does not cache windows near the head, which can still change", async () => {
    const { proxy, callsOf } = setup(servesLogs);
    await proxy.handle(getLogs(HEAD - 10, HEAD));
    await proxy.handle(getLogs(HEAD - 10, HEAD));
    expect(callsOf("eth_getLogs")).toHaveLength(2);
  });
});

describe("answers from memory", () => {
  it("answers the same read call within 3 s from memory", async () => {
    const { proxy, callsOf, advance } = setup();
    const call = { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: "0x1" }, "latest"] };
    await proxy.handle(call);
    await proxy.handle({ ...call, id: 2 });
    expect(callsOf("eth_call")).toHaveLength(1);
    advance(3_001);
    await proxy.handle({ ...call, id: 3 });
    expect(callsOf("eth_call")).toHaveLength(2);
  });

  it("shares one upstream call between identical reads arriving together", async () => {
    const { proxy, callsOf } = setup();
    const call = { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: "0x1" }, "latest"] };
    await Promise.all([proxy.handle(call), proxy.handle({ ...call, id: 2 })]);
    expect(callsOf("eth_call")).toHaveLength(1);
  });

  it("keeps eth_chainId after its first answer", async () => {
    const { proxy, callsOf, advance } = setup(() => ({ result: "0x14a34" }));
    await proxy.handle({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
    advance(60_000);
    const res = await proxy.handle({ jsonrpc: "2.0", id: 2, method: "eth_chainId", params: [] });
    expect(res).toEqual({ jsonrpc: "2.0", id: 2, result: "0x14a34" });
    expect(callsOf("eth_chainId")).toHaveLength(1);
  });

  it("sends writes every time", async () => {
    const { proxy, callsOf } = setup();
    const send = { jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: ["0x"] };
    await proxy.handle(send);
    await proxy.handle(send);
    expect(callsOf("eth_sendRawTransaction")).toHaveLength(2);
  });
});

describe("responses", () => {
  it("answers a batch in order, with each request's id", async () => {
    const { proxy } = setup((c) => ({ result: c.method }));
    const res = (await proxy.handleBody(
      JSON.stringify([
        { jsonrpc: "2.0", id: "a", method: "eth_gasPrice", params: [] },
        { jsonrpc: "2.0", id: "b", method: "net_version", params: [] },
      ]),
    )) as JsonRpcResponse[];
    expect(res).toEqual([
      { jsonrpc: "2.0", id: "a", result: "eth_gasPrice" },
      { jsonrpc: "2.0", id: "b", result: "net_version" },
    ]);
  });

  it("answers an empty batch with an invalid-request error", async () => {
    const { proxy } = setup();
    expect(await proxy.handleBody("[]")).toMatchObject({ id: null, error: { code: -32600 } });
  });

  it("answers unparseable input with a JSON-RPC parse error", async () => {
    const { proxy } = setup();
    expect(await proxy.handleBody("{not json")).toMatchObject({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700 },
    });
  });

  it("answers a request with no method with an invalid-request error", async () => {
    const { proxy } = setup();
    expect(await proxy.handle({ jsonrpc: "2.0", id: 9 })).toMatchObject({
      jsonrpc: "2.0",
      id: 9,
      error: { code: -32600 },
    });
  });

  it("passes an upstream's own error through, with the request's id", async () => {
    const { proxy } = setup(() => ({ error: { code: 3, message: "execution reverted" } }));
    expect(await proxy.handle({ jsonrpc: "2.0", id: 5, method: "eth_call", params: [] })).toEqual({
      jsonrpc: "2.0",
      id: 5,
      error: { code: 3, message: "execution reverted" },
    });
  });
});

describe("statusLine", () => {
  it("shows requests and failures per upstream, and Alchemy's use of its budget", async () => {
    const { proxy } = setup((c) =>
      c.url === ALCHEMY ? { result: "ok" } : { error: { message: "HTTP 503" } },
    );
    await proxy.handle({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [] });
    const line = proxy.statusLine();
    expect(line).toMatch(/served=1 failed=0/);
    expect(line).toMatch(/public-a\.test calls=1 failures=1/);
    expect(line).toMatch(/alchemy calls=1 failures=0 budget=1\/24000/);
    expect(line).not.toMatch(/alchemy\.test/);
  });
});
