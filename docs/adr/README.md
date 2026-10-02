# Architecture decision records

Each file records one decision already taken: why, what, and what it costs. Plans cite
them instead of re-arguing them. Facts about the systems verisci runs on (DKG, chain,
Inngest, Vercel, tooling) live in [`docs/domain.md`](../domain.md).

Numbers follow reading order: tools, environments, how writes behave, then the publish
flow before the rating flow that builds on it.

## Tools

| ADR | Decision |
| --- | --- |
| [0001. Toolchain: Biome, TypeScript 6, Soldeer, exact pins](0001-toolchain-biome-ts6-soldeer-exact-pins.md) | Biome replaces ESLint and Prettier; TypeScript 6.0.x; Soldeer; solc 0.8.37; every dependency pinned exactly |
| [0002. Internal packages ship TypeScript source](0002-internal-packages-ship-typescript-source.md) | Packages export `src/*.ts` with no build step; relative imports keep `.ts` |
| [0003. Inngest workflows live in the agents package](0003-inngest-workflows-live-in-agents.md) | Inngest functions live in `@verisci/agents`; `web` only serves them at `/api/inngest` |

## Environments and infrastructure

| ADR | Decision |
| --- | --- |
| [0004. Each workspace declares its own env variables](0004-each-workspace-declares-its-env.md) | `defineEnv` per workspace; fails fast, never shows values; `APP_ENV` required in production builds |
| [0005. Staging and production use separate resources](0005-staging-and-production-are-isolated.md) | Separate contracts, graphs, webhooks, wallets and keys per environment; only the node host is shared; only `develop` and `main` hold an oracle key and run the rating functions |
| [0006. The DKG node runs on a dedicated host](0006-dkg-node-runs-on-a-dedicated-host.md) | DKG daemon, GROBID and RPC proxy on their own host; Caddy is the only HTTP entry and every route needs auth; node keys backed up off the host |

## Writing to the DKG

How every store, mint and on-chain write behaves; both flows below rely on it.

| ADR | Decision |
| --- | --- |
| [0007. Every write converges: store, mint, fulfil and cancel](0007-all-writes-converge.md) | Each write reads state first and treats "already done" as success; nothing is regenerated on retry |
| [0008. Mints are async, polled in short steps](0008-mints-are-async-polled-in-short-steps.md) | `vm/publish-async` polled with `step.sleep`; a stored asset without a known job is polled for a full mint time before any new publish |
| [0009. Retries are spaced with step.sleep](0009-retries-are-spaced-with-step-sleep.md) | Explicit `step.sleep`, never `RetryAfterError` in `step.run`; start at 2 min, 5 attempts, 45 min |

## Publish flow

A PDF becomes a Target KA.

| ADR | Decision |
| --- | --- |
| [0010. PDFs become Target KAs in a stepped pipeline](0010-pdf-to-target-ka-pipeline.md) | Browser uploads to IPFS by signed URL; GROBID, LLM extraction, store, mint as steps; named from the PDF's CID, which events carry instead of bytes; a singleton per name |

## What a rating is

| ADR | Decision |
| --- | --- |
| [0011. A rating is a separate R-KA, linked by schema:about](0011-a-rating-is-a-separate-r-ka.md) | A rating is its own R-KA linked by `schema:about`; the target KA is never modified |
| [0012. Ratings evolve in three phases](0012-ratings-evolve-in-three-phases.md) | Machine score, then human review, then wet-lab; one score per phase, written once |
| [0013. A paper can have several ratings](0013-several-ratings-per-paper.md) | A rating is identified by its request id and R-KA UAL; rating count is a number |
| [0014. The contract owns scores, the DKG owns content](0014-contract-owns-scores-dkg-owns-content.md) | The UI shows the contract's score and flags a gap with the DKG |

## Rating flow

In the order a request lives: requested, named, ingested, scored, fulfilled, and recovered if stuck.

| ADR | Decision |
| --- | --- |
| [0015. Rating requests are free on testnet](0015-rating-requests-are-free-on-testnet.md) | Requesters pay only their gas; per-requester cap and a throttle bound spend; superseded before mainnet |
| [0016. Asset names derive from the on-chain request id](0016-asset-names-derive-from-request-id.md) | Each request gets its own v2 id, bound to requester and target; rating asset names and recovery derive from it, never from a browser |
| [0017. Chain events are ingested at least once](0017-chain-events-are-ingested-at-least-once.md) | Raw-body HMAC check, request logs only, dedup by request id (24 h), ack only after hand-off, `removed` logs ignored, request re-read on chain; the reconciler heals misses |
| [0018. The phase-1 scorer has a fixed output contract](0018-phase-1-scorer-output-contract.md) | `{ score, rationale, observed, missing }`, schema-validated, computed once and read back; the model is configuration |
| [0019. Oracle transactions are serialized](0019-oracle-transactions-are-serialized.md) | One dedicated function reads, sends and confirms every oracle transaction, one at a time, replacing stuck ones (10% fee bump) up to a fee cap; key and rating functions only on `develop` and `main`, key required in production; a run stops unless the contract's oracle is its key |
| [0020. A cron reconciler recovers stuck requests](0020-a-cron-reconciler-recovers-stuck-requests.md) | One singleton function per request id, started by webhook or Inngest cron (per-tick event ids); scores only if nothing is stored; past a maximum age, fulfils if minted, else cancels with a reason; stateless paging |

## App

| ADR | Decision |
| --- | --- |
| [0021. Server reads and actions return typed results](0021-server-reads-return-typed-results.md) | Never throw expected failures to the client, never swallow them into empty data |

## Open questions

Not decided yet. Each becomes an ADR in the plan that first needs the answer; the leaning is a starting point, not a decision.

| Question | Leaning | Decided in |
| --- | --- | --- |
| How does the UI list a paper's ratings? | The contract indexes request ids by target (`ratingsOf`), the authority for existence and scores ([0014](0014-contract-owns-scores-dkg-owns-content.md)); the DKG serves R-KA content on demand. `eth_getLogs` is ruled out ([domain](../domain.md)); an indexer only if reads outgrow view calls. | contracts plan |
| How do users authenticate? | Wallet connection via Reown AppKit + wagmi, as in the previous repo; on-chain requests need nothing more. Server actions that spend money (upload URLs, [0010](0010-pdf-to-target-ka-pipeline.md)) need a SIWE (EIP-4361) session to rate-limit per address. | first web plan with a wallet |
| Where do alerts go? | One channel the maintainer reads (chat bot webhook) behind a single `notify()`; a scheduled function checks wallet balances, orphans and the age of the oldest pending request, one signal for any stall (archived environment, stuck oracle lane, node down) ([0015](0015-rating-requests-are-free-on-testnet.md), [0007](0007-all-writes-converge.md), [0020](0020-a-cron-reconciler-recovers-stuck-requests.md)); an external uptime check polls the node's `/api/status`. | agents plan |
| Is the contract upgradeable? | No proxy on testnet: fixes redeploy, and the app reads a list of contract addresses (current plus read-only past ones). Ids include the contract address, so deployments never collide ([0016](0016-asset-names-derive-from-request-id.md)). A contract is retired only once its pending set is empty (the oracle cancels what is left), and its Alchemy webhook rule is moved to the new one in the same change. | contracts plan |
| Where does mutable app state live? | Nowhere authoritative: the chain and the DKG hold the truth, and recovery stores nothing ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)). Per-address rate limits on upload URLs need counters, so one small key-value store (Upstash Redis via the Vercel Marketplace) holds them, and losing it only resets the limits. | first web plan with a wallet |
| Who holds the DKG node's credential? | Today every Vercel scope, Preview included, holds the daemon's admin token, which can write the production graph ([0005](0005-staging-and-production-are-isolated.md)). Caddy keeps the daemon token on the host and checks one credential per environment, so either can be revoked alone; it cannot stop a staging write to production (the graph is in the body), so the `-prod` guard stays. | dkg plan |
| How are the rating functions run locally? | Never against the staging contract, whose oracle is `develop`'s ([0005](0005-staging-and-production-are-isolated.md)). A developer deploys their own contract on Base Sepolia with a local oracle key, and sends request events by hand to the Inngest dev server (webhooks cannot reach a laptop); R-KAs go to the staging graph like any preview's. | agents plan |

## Adding an ADR

1. Take the next number (`0022`, …) and name the file `NNNN-kebab-title.md`.
2. Put it in the group it belongs to (or a new one). Numbers are permanent once merged, so a new ADR takes the next number even if its group comes earlier. Use the same headings as the others: a title `# NNNN. Title`, then `Status` and `Date`,
   then `## Context`, `## Decision`, `## Consequences`. Keep it under a page.
3. Add a row to its group's table, and commit it with the plan that took the decision
   (scope `docs`, or the workspace it governs).
4. If it answers an open question, remove that row in the same commit.

Never edit an accepted ADR's decision. To change it, write a new ADR that supersedes it,
and set the old one's status to `Superseded by NNNN` (the only edit an accepted ADR gets).
