import { normalizeUal } from "@verisci/core";
import { type Connection, field, isSuccess, type Reply, send, toFailure } from "./http.ts";
import type { AssetResult, DkgFailure, MintResult, Quad, QueryResult } from "./types.ts";

/** How long a read, store or share waits for the node by default before reporting it unreachable. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** How long `startMint` listens for the mint's reply by default (ADR 0008). */
const DEFAULT_LISTEN_MS = 10_000;
/** Codes of a mint the network could not take now; a retry after a pause usually works (ADR 0009). */
const QUORUM_CODES = ["storage_ack_insufficient", "CORE_TEMPORARILY_UNAVAILABLE"];

/** Where the client sends its calls. */
export interface DkgClientConfig {
  /** The node's base URL, e.g. `http://127.0.0.1:9200`. */
  readonly url: string;
  /** Bearer token: the node's admin token locally, the environment's credential on the server. */
  readonly token: string;
  /** The full context graph id, `<agent address>/<name>` (`docs/domain.md` → DKG). */
  readonly contextGraphId: string;
  /** How long a read, store or share waits for the node; 30 s by default. */
  readonly timeoutMs?: number;
  /** Defaults to the global `fetch`; tests pass a fake node. */
  readonly fetch?: typeof fetch;
}

/** The calls `createDkgClient` returns. */
export interface DkgClient {
  /**
   * Reads where the asset stands: missing, draft, stored or minted. The node answers 404
   * both for an asset never stored and for a graph it does not serve, so a 404 is read as
   * `missing` only once the node lists the graph as subscribed; otherwise the result is
   * `graph-not-served`.
   */
  readAsset(name: string): Promise<AssetResult>;
  /**
   * Stores the asset and shares it, so it is ready to mint. Reads the state first and does
   * only what is left (ADR 0007): a stored or minted asset keeps its first content, and
   * `quads` are sent only when the name was never stored. Empty `quads` only share a draft:
   * for a name never stored they return `no-content`, so no asset is ever created empty.
   * Returns `stored` or `minted`, or a failure: never `draft`.
   */
  storeAsset(name: string, quads: readonly Quad[]): Promise<AssetResult>;
  /**
   * Starts the mint of a stored asset and listens for its reply for `listenMs` (10 s by
   * default). Returns `minted` with the UAL, or `minting` when the reply did not come in
   * time or a mint may already be in flight: the caller then polls `readAsset` (ADR 0008).
   * A minted asset is never minted again (ADR 0007).
   */
  startMint(name: string, options?: { readonly listenMs?: number }): Promise<MintResult>;
  /**
   * Runs a SPARQL `SELECT` on the graph (`POST /api/query`) and returns its rows. Terms come
   * as the node writes them: IRIs bare, literals quoted. A row with a value that is not a
   * string is dropped.
   */
  query(sparql: string): Promise<QueryResult>;
}

/** Builds a client for one context graph on one DKG node. Every UAL it returns is normalized (ADR 0031). */
export function createDkgClient(config: DkgClientConfig): DkgClient {
  const connection: Connection = {
    url: config.url,
    token: config.token,
    fetch: config.fetch ?? globalThis.fetch,
  };
  const graph = { contextGraphId: config.contextGraphId };
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const assetPath = (name: string) => `/api/knowledge-assets/${encodeURIComponent(name)}`;

  async function readAsset(name: string): Promise<AssetResult> {
    const query = new URLSearchParams(graph).toString();
    const reply = await send(connection, "GET", `${assetPath(name)}?${query}`, { timeoutMs });
    if (reply.kind === "answer" && reply.status === 404) {
      const served = await isGraphServed();
      if (served === true) return { ok: true, state: "missing" };
      return served === false ? { ok: false, reason: "graph-not-served" } : served;
    }
    if (reply.kind !== "answer" || !isSuccess(reply)) return toFailure(reply);
    return toAssetState(reply.body) ?? { ok: false, reason: "unexpected", status: reply.status };
  }

  /**
   * True when the node lists the graph as subscribed; a failure when the list cannot be read.
   * Asked on every 404, never remembered: a node restart can drop the graph at any time.
   */
  async function isGraphServed(): Promise<boolean | DkgFailure> {
    const reply = await send(connection, "GET", "/api/context-graph/list", { timeoutMs });
    if (reply.kind !== "answer" || !isSuccess(reply)) return toFailure(reply);
    const graphs = field(reply.body, "contextGraphs");
    if (!Array.isArray(graphs)) return { ok: false, reason: "unexpected", status: reply.status };
    return graphs.some(
      (entry) =>
        sameGraphId(String(field(entry, "id")), config.contextGraphId) &&
        field(entry, "subscribed") === true,
    );
  }

  async function share(name: string): Promise<Reply> {
    return send(connection, "POST", `${assetPath(name)}/swm/share`, { body: graph, timeoutMs });
  }

  async function storeAsset(name: string, quads: readonly Quad[]): Promise<AssetResult> {
    let current = await readAsset(name);
    if (!current.ok) return current;

    if (current.state === "missing") {
      // Never mint an empty asset: its name would be taken for good.
      if (quads.length === 0) return { ok: false, reason: "no-content" };
      const created = await send(connection, "POST", "/api/knowledge-assets", {
        body: { ...graph, name, quads },
        timeoutMs,
      });
      if (isSuccess(created)) {
        current = { ok: true, state: "draft" };
      } else if (isConflict(created)) {
        // A racing store sealed or minted it first: each 409 is final, so go on from the state.
        current = await readAsset(name);
        if (!current.ok) return current;
      } else {
        return toFailure(created);
      }
    }

    if (current.state === "draft") {
      const shared = await share(name);
      // A 409 may be a racing share: the state says where things stand.
      if (!isSuccess(shared) && !isConflict(shared)) return toFailure(shared);
      const after = await readAsset(name);
      // Still a draft: the node refused the share for another reason.
      if (after.ok && after.state === "draft") return toFailure(shared);
      return after;
    }

    return current;
  }

  async function startMint(
    name: string,
    options: { readonly listenMs?: number } = {},
  ): Promise<MintResult> {
    const before = await readAsset(name);
    if (!before.ok) return before;
    if (before.state === "minted") return before;
    if (before.state !== "stored") return { ok: false, reason: "not-stored" };

    const reply = await send(connection, "POST", `${assetPath(name)}/vm/publish`, {
      body: graph,
      timeoutMs: options.listenMs ?? DEFAULT_LISTEN_MS,
    });
    // The node finishes a mint after the client stops listening (docs/domain.md).
    if (reply.kind === "timeout") return { ok: true, state: "minting" };
    if (reply.kind === "network-error") return toFailure(reply);
    if (isQuorumFailure(reply.body)) return { ok: false, reason: "retry-later" };
    if (reply.status >= 200 && reply.status < 300) {
      const ual = canonical(field(reply.body, "ual"));
      if (field(reply.body, "status") === "confirmed" && ual !== undefined) {
        return { ok: true, state: "minted", ual };
      }
    } else if (reply.status !== 409 && reply.status < 500) {
      return toFailure(reply);
    }

    // A 409, a 500 or an odd success: only the state tells minted from a mint in flight.
    const after = await readAsset(name);
    if (!after.ok) return after;
    if (after.state === "minted") return after;
    if (after.state === "stored") return { ok: true, state: "minting" };
    return { ok: false, reason: "unexpected", status: reply.status };
  }

  async function query(sparql: string): Promise<QueryResult> {
    const reply = await send(connection, "POST", "/api/query", {
      body: { sparql, ...graph },
      timeoutMs,
    });
    if (reply.kind !== "answer" || !isSuccess(reply)) return toFailure(reply);
    const rows = field(field(reply.body, "result"), "bindings");
    if (!Array.isArray(rows)) return { ok: false, reason: "unexpected", status: reply.status };
    return { ok: true, bindings: rows.filter(isStringRow) };
  }

  return { readAsset, storeAsset, startMint, query };
}

/** Same graph: the agent address in any case, the graph name exactly. */
function sameGraphId(a: string, b: string): boolean {
  const [addressA, ...nameA] = a.split("/");
  const [addressB, ...nameB] = b.split("/");
  return addressA?.toLowerCase() === addressB?.toLowerCase() && nameA.join("/") === nameB.join("/");
}

function isConflict(reply: Reply): boolean {
  return reply.kind === "answer" && reply.status === 409;
}

/** Maps the node's state body to an `AssetState`; `undefined` when it cannot be read. */
function toAssetState(body: unknown): AssetResult | undefined {
  switch (field(body, "state")) {
    case "created":
      return { ok: true, state: "draft" };
    case "promoted": {
      const reservedUal = canonical(field(body, "reservedUal"));
      return reservedUal === undefined ? undefined : { ok: true, state: "stored", reservedUal };
    }
    case "published": {
      const ual = canonical(field(body, "publishedUal"));
      return ual === undefined ? undefined : { ok: true, state: "minted", ual };
    }
    default:
      return undefined;
  }
}

function canonical(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = normalizeUal(value);
  return result.ok ? result.ual : undefined;
}

function isQuorumFailure(body: unknown): boolean {
  const text = [field(body, "code"), field(body, "error")]
    .filter((part) => typeof part === "string")
    .join(" ");
  return QUORUM_CODES.some((code) => text.includes(code));
}

/** A SPARQL row whose every value is a string. */
function isStringRow(row: unknown): row is Readonly<Record<string, string>> {
  return (
    typeof row === "object" &&
    row !== null &&
    Object.values(row).every((value) => typeof value === "string")
  );
}
