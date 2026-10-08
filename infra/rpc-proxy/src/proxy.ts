import type { DailyBudget } from "./budget.ts";

/** What one upstream answered: a result, or an error (its own, or the transport's). */
export type UpstreamReply =
  | { readonly result: unknown }
  | { readonly error: { readonly code?: number; readonly message: string } };

/** Sends one JSON-RPC body to one upstream URL. Never throws: a failure is an `error` reply. */
export type Post = (url: string, body: object, timeoutMs: number) => Promise<UpstreamReply>;

/** A JSON-RPC 2.0 response, as the DKG daemon expects it. */
export interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id: unknown;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
}

/** What {@link createProxy} needs; the network and the clock are injected. */
export interface ProxyOptions {
  /** Alchemy's URL, key included: asked last, within `budget`. */
  readonly alchemyUrl: string;
  /** Free public endpoints, asked first, in order. */
  readonly publicUrls: readonly string[];
  readonly budget: DailyBudget;
  readonly post: Post;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  /** Most `eth_getLogs` windows kept in memory. */
  readonly logCacheMax?: number;
}

/** The proxy: answers JSON-RPC requests and reports its counters. */
export interface Proxy {
  handle(request: unknown): Promise<JsonRpcResponse>;
  /** Answers a raw HTTP body: one request or a batch. */
  handleBody(text: string): Promise<JsonRpcResponse | JsonRpcResponse[]>;
  /** One line of counters, for the log every 30 s. */
  statusLine(): string;
}

type Lane = "fast" | "bulk";

/** Public endpoints accept 2,000-block log ranges; Alchemy's free tier accepts 10. */
const PUBLIC_SPAN = 2_000;
const ALCHEMY_SPAN = 10;
/** Below this, a window the public endpoints refuse goes to Alchemy in slices. */
const MIN_PUBLIC_SPAN = 250;
/** Logs this many blocks below the head no longer change, so they are cached. */
const FINALITY_BLOCKS = 64;
const READ_TTL_MS = 3_000;
const COOLDOWN_MS = 1_500;
const DEFAULT_LOG_CACHE_MAX = 20_000;
const READ_CACHE_MAX = 10_000;
const SLICE_WORKERS = 4;
/** Read calls answered from memory for {@link READ_TTL_MS}; `eth_chainId` is kept for good. */
const SHORT_LIVED_READS = new Set(["eth_call", "eth_getBlockByNumber", "eth_blockNumber"]);

/**
 * The daemon's head probe times out after about 4 s, so fast calls get their own slots and
 * never wait behind the log backfill.
 */
const LANES: Record<Lane, { rounds: number; timeoutMs: number; slots: number }> = {
  fast: { rounds: 3, timeoutMs: 6_000, slots: 6 },
  bulk: { rounds: 4, timeoutMs: 30_000, slots: 4 },
};

interface LogFilter {
  readonly fromBlock?: unknown;
  readonly toBlock?: unknown;
  readonly blockHash?: unknown;
  readonly [key: string]: unknown;
}

/**
 * A JSON-RPC proxy for the DKG daemon, which takes a single `rpcUrl`. It asks free public
 * endpoints first and Alchemy last, within a daily budget; splits `eth_getLogs` ranges into
 * windows the endpoints accept; and answers repeated reads from memory.
 */
export function createProxy(options: ProxyOptions): Proxy {
  const { alchemyUrl, publicUrls, budget, post, now, sleep } = options;
  const logCacheMax = options.logCacheMax ?? DEFAULT_LOG_CACHE_MAX;
  const allUrls = [...publicUrls, alchemyUrl];

  const cooldownUntil = new Map<string, number>();
  const slots = new Map<string, { active: number; waiters: (() => void)[] }>();
  const upstreamStats = new Map(allUrls.map((url) => [url, { calls: 0, failures: 0 }]));
  const logCache = new Map<string, unknown[]>();
  const logsInFlight = new Map<string, Promise<unknown[]>>();
  const readCache = new Map<string, { reply: UpstreamReply; until: number }>();
  let served = 0;
  let failed = 0;

  async function withSlot<T>(url: string, lane: Lane, fn: () => Promise<T>): Promise<T> {
    const key = `${url}|${lane}`;
    let slot = slots.get(key);
    if (!slot) {
      slot = { active: 0, waiters: [] };
      slots.set(key, slot);
    }
    const s = slot;
    if (s.active >= LANES[lane].slots) await new Promise<void>((r) => s.waiters.push(r));
    s.active++;
    try {
      return await fn();
    } finally {
      s.active--;
      s.waiters.shift()?.();
    }
  }

  async function call(url: string, body: object, lane: Lane): Promise<UpstreamReply> {
    const reply = await withSlot(url, lane, () => post(url, body, LANES[lane].timeoutMs));
    const stats = upstreamStats.get(url);
    if (stats) {
      stats.calls++;
      if ("error" in reply) stats.failures++;
    }
    return reply;
  }

  /** Tries each endpoint in order, retrying transient failures; Alchemy only within budget. */
  async function resolve(body: object, lane: Lane, urls: readonly string[] = allUrls) {
    const { rounds } = LANES[lane];
    let last = "no endpoint attempted";
    for (let round = 0; round < rounds; round++) {
      const respectCooldown = round < rounds - 1;
      let attempted = false;
      for (const url of urls) {
        if (respectCooldown && (cooldownUntil.get(url) ?? 0) > now()) continue;
        if (url === alchemyUrl && !budget.tryUse()) {
          last = "Alchemy daily budget used up";
          continue;
        }
        attempted = true;
        const reply = await call(url, body, lane);
        if ("result" in reply || !isTransient(reply.error.message)) return reply;
        last = reply.error.message;
        if (isThrottle(last)) cooldownUntil.set(url, now() + COOLDOWN_MS);
      }
      const onlyAlchemyLeft = urls.every((u) => u === alchemyUrl);
      if (onlyAlchemyLeft && budget.used() >= budget.limit) break;
      if (round < rounds - 1) await sleep(attempted ? 150 * 2 ** round : 500);
    }
    return { error: { code: -32000, message: `all endpoints failed: ${last.slice(0, 120)}` } };
  }

  /** Reads answered from memory; only successful answers are kept. */
  async function cachedRead(method: string, params: unknown, body: object) {
    const forGood = method === "eth_chainId";
    if (!forGood && !SHORT_LIVED_READS.has(method)) return resolve(body, "fast");
    const key = `${method}|${JSON.stringify(params ?? [])}`;
    const hit = readCache.get(key);
    if (hit && hit.until > now()) return hit.reply;
    const reply = await resolve(body, "fast");
    if ("result" in reply) {
      remember(readCache, key, { reply, until: forGood ? Infinity : now() + READ_TTL_MS });
      if (readCache.size > READ_CACHE_MAX) dropExpired();
    }
    return reply;
  }

  function dropExpired() {
    for (const [key, entry] of readCache) if (entry.until <= now()) readCache.delete(key);
    while (readCache.size > READ_CACHE_MAX) readCache.delete(readCache.keys().next().value ?? "");
  }

  async function headBlock(): Promise<number> {
    const body = { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] };
    const reply = await cachedRead("eth_blockNumber", [], body);
    const head = "result" in reply ? Number(reply.result) : Number.NaN;
    if (!Number.isFinite(head)) throw new Error("chain head unavailable");
    return head;
  }

  function logsBody(filter: LogFilter, lo: number, hi: number) {
    return {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [{ ...filter, fromBlock: toHex(lo), toBlock: toHex(hi) }],
    };
  }

  async function alchemySlices(filter: LogFilter, lo: number, hi: number): Promise<unknown[]> {
    const slices: [number, number][] = [];
    for (let a = lo; a <= hi; a += ALCHEMY_SPAN)
      slices.push([a, Math.min(a + ALCHEMY_SPAN - 1, hi)]);
    const out: unknown[][] = new Array(slices.length);
    let cursor = 0;
    async function worker() {
      while (cursor < slices.length) {
        const index = cursor++;
        const [a, b] = slices[index] ?? [lo, hi];
        const reply = await resolve(logsBody(filter, a, b), "bulk", [alchemyUrl]);
        if (!("result" in reply) || !Array.isArray(reply.result)) {
          const why = "error" in reply ? reply.error.message : "not a list";
          throw new Error(`logs ${a}-${b}: ${why}`);
        }
        out[index] = reply.result;
      }
    }
    await Promise.all(Array.from({ length: Math.min(SLICE_WORKERS, slices.length) }, worker));
    return out.flat();
  }

  /** One window: public endpoints, then smaller public windows, then Alchemy slices. */
  async function fetchWindow(filter: LogFilter, lo: number, hi: number): Promise<unknown[]> {
    const reply = await resolve(logsBody(filter, lo, hi), "bulk", publicUrls);
    if ("result" in reply && Array.isArray(reply.result)) return reply.result;
    if (hi - lo + 1 <= MIN_PUBLIC_SPAN) return alchemySlices(filter, lo, hi);
    const mid = Math.floor((lo + hi) / 2);
    return [...(await fetchWindow(filter, lo, mid)), ...(await fetchWindow(filter, mid + 1, hi))];
  }

  async function windowLogs(filter: LogFilter, lo: number, hi: number, head: number) {
    const key = JSON.stringify([filter.address, filter.topics, lo, hi]);
    const final = hi < head - FINALITY_BLOCKS;
    const hit = final ? logCache.get(key) : undefined;
    if (hit) {
      remember(logCache, key, hit);
      return hit;
    }
    const pending = logsInFlight.get(key);
    if (pending !== undefined) return pending;
    const work = fetchWindow(filter, lo, hi);
    logsInFlight.set(key, work);
    try {
      const logs = await work;
      if (final) {
        remember(logCache, key, logs);
        if (logCache.size > logCacheMax) logCache.delete(logCache.keys().next().value ?? "");
      }
      return logs;
    } finally {
      logsInFlight.delete(key);
    }
  }

  async function getLogs(params: unknown, body: object): Promise<UpstreamReply> {
    const filter: LogFilter = (
      Array.isArray(params) && isObject(params[0]) ? params[0] : {}
    ) as LogFilter;
    if (filter.blockHash !== undefined) return resolve(body, "bulk");
    const head = await headBlock();
    const from = toBlock(filter.fromBlock, 0, head);
    const to = Math.min(toBlock(filter.toBlock, head, head), head);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return { result: [] };
    const out: unknown[] = [];
    for (let lo = from; lo <= to; lo += PUBLIC_SPAN) {
      out.push(...(await windowLogs(filter, lo, Math.min(lo + PUBLIC_SPAN - 1, to), head)));
    }
    return { result: out };
  }

  async function handle(request: unknown): Promise<JsonRpcResponse> {
    const id = isObject(request) && "id" in request ? request.id : null;
    let response: JsonRpcResponse;
    if (!isObject(request) || typeof request.method !== "string") {
      response = { jsonrpc: "2.0", id, error: { code: -32600, message: "invalid request" } };
    } else {
      try {
        const reply =
          request.method === "eth_getLogs"
            ? await getLogs(request.params, request)
            : await cachedRead(request.method, request.params, request);
        response = toResponse(id, reply);
      } catch (e) {
        response = { jsonrpc: "2.0", id, error: { code: -32000, message: errorMessage(e) } };
      }
    }
    served++;
    if (response.error) failed++;
    return response;
  }

  return {
    handle,
    async handleBody(text) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } };
      }
      return Array.isArray(parsed) ? Promise.all(parsed.map(handle)) : handle(parsed);
    },
    statusLine() {
      const parts = allUrls.map((url) => {
        const s = upstreamStats.get(url) ?? { calls: 0, failures: 0 };
        const name = url === alchemyUrl ? "alchemy" : new URL(url).host;
        const extra = url === alchemyUrl ? ` budget=${budget.used()}/${budget.limit}` : "";
        return `${name} calls=${s.calls} failures=${s.failures}${extra}`;
      });
      return [`served=${served} failed=${failed}`, ...parts, `logCache=${logCache.size}`].join(
        " | ",
      );
    },
  };
}

/** Moves `key` to the newest end of an insertion-ordered map. */
function remember<V>(map: Map<string, V>, key: string, value: V): void {
  map.delete(key);
  map.set(key, value);
}

function toResponse(id: unknown, reply: UpstreamReply): JsonRpcResponse {
  if ("result" in reply) return { jsonrpc: "2.0", id, result: reply.result };
  return {
    jsonrpc: "2.0",
    id,
    error: { code: reply.error.code ?? -32000, message: reply.error.message },
  };
}

function toBlock(tag: unknown, fallback: number, head: number): number {
  if (tag === undefined || tag === null) return fallback;
  if (tag === "latest" || tag === "pending" || tag === "safe" || tag === "finalized") return head;
  if (tag === "earliest") return 0;
  return typeof tag === "string" ? Number.parseInt(tag, 16) : Number(tag);
}

const toHex = (n: number) => `0x${n.toString(16)}`;

function isThrottle(message: string): boolean {
  const m = message.toLowerCase();
  return ["429", "rate", "too many", "capacity", "limit exceeded"].some((w) => m.includes(w));
}

function isTransient(message: string): boolean {
  const m = message.toLowerCase();
  return (
    isThrottle(message) || ["fetch", "timeout", "abort", "502", "503"].some((w) => m.includes(w))
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
