import { createServer } from "node:http";
import { createDailyBudget } from "./budget.ts";
import { readConfig } from "./config.ts";
import { createProxy, type Post } from "./proxy.ts";

/** Free Base Sepolia endpoints, asked before Alchemy, in this order. */
const PUBLIC_RPCS = ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"];
const STATUS_EVERY_MS = 30_000;
/** The daemon's requests are small; this bounds memory if something sends a huge body. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

const configResult = readConfig(process.env);
if (!configResult.ok) {
  for (const error of configResult.errors) console.error(`rpc-proxy: ${error}`);
  process.exit(1);
}
const config = configResult.config;

/** Real upstream calls. Messages never include the URL, which holds Alchemy's key. */
const post: Post = async (url, body, timeoutMs) => {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 429) return { error: { message: "HTTP 429 throttled" } };
    const text = await res.text();
    try {
      const json = JSON.parse(text) as {
        result?: unknown;
        error?: { code?: number; message?: unknown };
      };
      if (json && "result" in json) return { result: json.result };
      if (json?.error) {
        return { error: { code: json.error.code, message: String(json.error.message) } };
      }
    } catch {
      // Not JSON: reported below with the HTTP status.
    }
    return { error: { message: `HTTP ${res.status} ${text.slice(0, 140)}` } };
  } catch (e) {
    return { error: { message: `fetch failed: ${e instanceof Error ? e.name : "error"}` } };
  }
};

const proxy = createProxy({
  alchemyUrl: config.upstreamRpc,
  publicUrls: PUBLIC_RPCS,
  budget: createDailyBudget(config.alchemyDailyLimit, Date.now),
  post,
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

setInterval(() => console.log(`stat ${proxy.statusLine()}`), STATUS_EVERY_MS).unref();

createServer((req, res) => {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) req.destroy();
    else chunks.push(chunk);
  });
  req.on("end", () => {
    proxy
      .handleBody(Buffer.concat(chunks).toString("utf8"))
      .then((answer) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(answer));
      })
      .catch((e: unknown) => {
        console.error(`rpc-proxy: request failed: ${e instanceof Error ? e.name : "error"}`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: "internal error" },
          }),
        );
      });
  });
}).listen(config.port, "127.0.0.1", () => {
  console.log(`rpc-proxy listening on 127.0.0.1:${config.port}`);
});
