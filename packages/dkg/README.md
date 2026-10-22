# @labstrail/dkg

Adapter between `core` and the DKG: reads and writes Knowledge Assets.

The DKG node it calls runs on the DKG node server
([ADR 0006](../../docs/adr/0006-dkg-node-runs-on-a-dedicated-host.md)), at
`https://verisci-dkg.duckdns.org`, behind Caddy, which checks each environment's credential
([ADR 0039](../../docs/adr/0039-one-credential-per-environment.md)). The node reads the chain through
[`infra/rpc-proxy`](../../infra/rpc-proxy/README.md)
([`docs/node-host.md`](../../docs/node-host.md) → How the parts connect); a publish that fails
with `authority-resolution-failed` is often a chain-read problem there, not in this
package (`docs/domain.md` → DKG).

Status: a client to read an asset's state, store it, start its mint, and run a SPARQL
query (`query`), which reads a published paper's record back, lists the published papers
(a page, the count and the page's first authors), and reads a paper's PDF link (a rating
run) and a rating back (a rating run, and the rating pages, which also read an R-KA's state);
`checkGraph`, whether the node serves the graph; and `readStatus`, the node's open health
check, which the hourly health check reads.

Architecture views: [`.omm/overall-architecture/dkg-client/`](../../.omm/overall-architecture/dkg-client/), [`.omm/state-transitions/asset-state/`](../../.omm/state-transitions/asset-state/) (`pnpm exec omm view --port 4000` shows them; root README → Architecture).

## Depends on

`@labstrail/core` (UAL normalization), `@labstrail/env`, Zod, and viem (the EIP-55 checksum of
`DKG_CONTEXT_GRAPH`'s address).

## Environment

Declared in `src/dkg-env.ts` (`createDkgEnv`) and validated on first import of
`@labstrail/dkg/env` (`src/env.ts`), not of the main entry, so a workspace that only imports
the client's types never needs them.

| Variable | Value |
| --- | --- |
| `DKG_URL` | The node's base URL: `https://verisci-dkg.duckdns.org` in every environment ([`docs/node-host.md`](../../docs/node-host.md) → The two names) |
| `DKG_TOKEN` | Bearer token: the environment's credential for the node server (`local`, `staging` or `production`, [`docs/node-host.md`](../../docs/node-host.md) → The credentials), which also opens GROBID. Secret |
| `DKG_CONTEXT_GRAPH` | The full context graph id, `<agent address>/<graph name>`, with the address in EIP-55 checksum case as the node lists it, such as `0xD701…13B3/verisci-staging` |

`DKG_CONTEXT_GRAPH` is refused when it is a bare name or its address is in another case
than the node's EIP-55 spelling (either reads another, empty graph, `docs/domain.md` →
DKG), when it ends in `-prod` and `APP_ENV` is not `production`, and when `APP_ENV` is
`production` and it does not
([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)). The workflows and
the `publish-pdf` script build on the same rule.

## API

| Export | What it does |
| --- | --- |
| `dkgName` | The package name, imported by the web app's package test |
| `createDkgClient({ url, token, contextGraphId, timeoutMs?, fetch? })` | A `DkgClient` for one context graph on one node; `timeoutMs` (30 s by default) bounds each read, store and share; `fetch` defaults to the global one |
| `client.readAsset(name)` | Where the asset stands: `missing`, `draft` (sealed, not shared), `stored` (with `reservedUal`) or `minted` (with `ual`); `graph-not-served` when the node does not serve the graph |
| `client.storeAsset(name, quads)` | Stores and shares the asset, doing only what is left, and returns `stored` or `minted`; a stored or minted asset keeps its first content |
| `client.startMint(name, { listenMs? })` | Starts the mint of a stored asset; returns `minted` with its UAL, or `minting` when no reply came within `listenMs` (10 s by default) or a mint may be in flight |
| `client.query(sparql)` | Runs a SPARQL `SELECT` on the graph (`POST /api/query`, with the full graph id) and returns its rows; terms come as the node writes them, IRIs bare and literals quoted |
| `client.readStatus()` | Reads the node's open health check (`GET /api/status`, sent with no credential, [ADR 0039](../../docs/adr/0039-one-credential-per-environment.md)): `{ ok: true, graph }`, the graph's `authorityState` and `policySource` as the node's catalog lists it (`undefined` when not listed), or `unreachable`, `unauthorized` or `unexpected` with its status; the health check alerts on it |
| `client.checkGraph()` | `ok` when the node lists the graph as subscribed, `graph-not-served` when it does not, or a failure when the list cannot be read; the node answers a query on a graph it does not hold with no rows (`docs/domain.md` → DKG), so check this before reading an empty answer as "nothing there" |
| `DkgClient`, `DkgClientConfig` | The client's calls and its settings |
| `Quad`, `AssetState`, `AssetResult`, `MintResult`, `QueryResult`, `NodeStatus`, `GraphStatus`, `DkgFailure` | The client's input and result types |
| `env` (from `@labstrail/dkg/env`) | The settings, validated from `process.env` on import |
| `dkgSchema(isProduction)` | The three variables' rules, for a workspace that validates them with its own in one pass |
| `contextGraphSchema(isProduction)` | The rule for `DKG_CONTEXT_GRAPH` (full id, address in EIP-55 case, `-prod` guard), for a script that reads only that variable |
| `createDkgEnv(runtimeEnv)`, `DkgEnv` (from either entry) | The function that validates the settings from a given object, when called (what `@labstrail/dkg/env` and tests use), and their type; a workspace that also reads the DKG settings spreads `dkgSchema` into its own `defineEnv` instead |

```ts
import { createDkgClient } from "@labstrail/dkg";
import { env } from "@labstrail/dkg/env";

const dkg = createDkgClient({
  url: env.DKG_URL,
  token: env.DKG_TOKEN,
  contextGraphId: env.DKG_CONTEXT_GRAPH,
});

const stored = await dkg.storeAsset(name, quads);
const mint = await dkg.startMint(name);
// mint.state === "minting": poll dkg.readAsset(name) until it reads "minted".
```

Every call returns a typed result and never throws for an expected failure. A failure's
`reason` is `unreachable`, `unauthorized`, `graph-not-served`, `not-stored`, `no-content`
(a store with no quads found no asset to share: an asset is never created empty),
`retry-later` (a quorum failure: retry after a pause, [ADR 0009](../../docs/adr/0009-retries-are-spaced-with-step-sleep.md))
or `unexpected`, with the HTTP status and the node's error code. No result carries the
token. The node answers 404 both for an asset never stored and for a graph it does not
serve, so before reading a 404 as `missing` the client checks, on every 404, that the
node lists the graph as subscribed: otherwise a rating whose graph was dropped after a
restart would read as never stored. Every UAL returned is normalized
([ADR 0031](../../docs/adr/0031-uals-are-normalized-before-the-contract.md)).

Stores and mints converge: each reads the state first and does only what is left, so a
retry never repeats a write already done
([ADR 0007](../../docs/adr/0007-all-writes-converge.md)). A mint keeps running on the node
after the client stops listening; the caller polls `readAsset`, and restarts the mint only
after the maximum mint time
([ADR 0008](../../docs/adr/0008-mints-are-async-polled-in-short-steps.md)). The node's
routes and refusals are in `docs/domain.md` → DKG.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @labstrail/dkg typecheck` | Typechecks the package |
| `pnpm --filter @labstrail/dkg test` | Runs its Vitest project (`vitest run`) against a fake node |

Ships TypeScript source (`src/index.ts`, `src/env.ts`), with no build step.
