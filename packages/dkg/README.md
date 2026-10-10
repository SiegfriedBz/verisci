# @verisci/dkg

Adapter between `core` and the DKG: reads and writes Knowledge Assets.

The DKG node it calls runs on the DKG node server
([ADR 0006](../../docs/adr/0006-dkg-node-runs-on-a-dedicated-host.md)): on a developer's
computer at `http://127.0.0.1:9200` for now, and once on a host, over HTTPS through Caddy
with a credential. The node reads the chain through
[`infra/rpc-proxy`](../../infra/rpc-proxy/README.md)
([`docs/node-host.md`](../../docs/node-host.md) → How the parts connect); a publish that fails
with `authority-resolution-failed` is often a chain-read problem there, not in this
package (`docs/domain.md` → DKG).

Status: a client to read an asset's state, store it and start its mint.

## Depends on

`@verisci/core` (UAL normalization), `@verisci/env`, and Zod.

## Environment

Declared in `src/dkg-env.ts` (`createDkgEnv`) and validated on first import of
`@verisci/dkg/env` (`src/env.ts`), not of the main entry, so a workspace that only imports the client's types never needs them.

| Variable | Value |
| --- | --- |
| `DKG_URL` | The node's base URL: `http://127.0.0.1:9200` locally |
| `DKG_TOKEN` | Bearer token: the node's admin token (`~/.dkg/auth.token`) locally; the environment's credential once the node is on its server |
| `DKG_CONTEXT_GRAPH` | The full context graph id, `<agent address>/<graph name>`, such as `0x…/verisci-staging` |

`DKG_CONTEXT_GRAPH` is refused when it is a bare name (which reads another, empty graph,
`docs/domain.md` → DKG), when it ends in `-prod` and `APP_ENV` is not `production`, and when
`APP_ENV` is `production` and it does not
([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)).

## API

| Export | What it does |
| --- | --- |
| `createDkgClient({ url, token, contextGraphId, timeoutMs?, fetch? })` | A `DkgClient` for one context graph on one node; `timeoutMs` (30 s by default) bounds each read, store and share; `fetch` defaults to the global one |
| `client.readAsset(name)` | Where the asset stands: `missing`, `draft` (sealed, not shared), `stored` (with `reservedUal`) or `minted` (with `ual`); `graph-not-served` when the node does not serve the graph |
| `client.storeAsset(name, quads)` | Stores and shares the asset, doing only what is left, and returns `stored` or `minted`; a stored or minted asset keeps its first content |
| `client.startMint(name, { listenMs? })` | Starts the mint of a stored asset; returns `minted` with its UAL, or `minting` when no reply came within `listenMs` (10 s by default) or a mint may be in flight |
| `DkgClient`, `DkgClientConfig` | The client's calls and its settings |
| `Quad`, `AssetState`, `AssetResult`, `MintResult`, `DkgFailure` | The client's input and result types |
| `env` (from `@verisci/dkg/env`) | The settings, validated from `process.env` on import |
| `createDkgEnv(runtimeEnv)`, `DkgEnv` (from either entry) | The function that validates the settings from a given object, when called, and their type; another workspace's env extends it |

```ts
import { createDkgClient } from "@verisci/dkg";
import { env } from "@verisci/dkg/env";

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
`reason` is `unreachable`, `unauthorized`, `graph-not-served`, `not-stored`, `retry-later` (a quorum failure:
retry after a pause, [ADR 0009](../../docs/adr/0009-retries-are-spaced-with-step-sleep.md))
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
| `pnpm --filter @verisci/dkg typecheck` | Typechecks the package |
| `pnpm --filter @verisci/dkg test` | Runs its Vitest project (`vitest run`) against a fake node |

Ships TypeScript source (`src/index.ts`, `src/env.ts`), with no build step.
