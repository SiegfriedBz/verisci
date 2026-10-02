# Architecture decision records

Each file records one decision already taken: why, what, and what it costs. Plans cite
them instead of re-arguing them. Facts about the systems verisci runs on (DKG, chain,
Inngest, Vercel, tooling) live in [`docs/domain.md`](../domain.md).

## Foundations

| ADR | Decision |
| --- | --- |
| [0001. Toolchain: Biome, TypeScript 6, Soldeer, exact pins](0001-toolchain-biome-ts6-soldeer-exact-pins.md) | Biome replaces ESLint and Prettier; TypeScript 6.0.x; Soldeer; solc 0.8.37; every dependency pinned exactly |
| [0002. Internal packages ship TypeScript source](0002-internal-packages-ship-typescript-source.md) | Packages export `src/*.ts` with no build step; relative imports keep `.ts` |
| [0003. Inngest workflows live in the agents package](0003-inngest-workflows-live-in-agents.md) | Inngest functions live in `@verisci/agents`; `web` only serves them at `/api/inngest` |

## Environments and infrastructure

| ADR | Decision |
| --- | --- |
| [0004. Staging and production use separate resources](0004-staging-and-production-are-isolated.md) | Separate contracts, graphs, webhooks, wallets and keys per environment; only the node host is shared; only `develop` and `main` hold an oracle key |
| [0005. Each workspace declares its own env variables](0005-each-workspace-declares-its-env.md) | `defineEnv` per workspace; fails fast, never shows values; `APP_ENV` required in production builds |
| [0006. The DKG node runs on a dedicated host](0006-dkg-node-runs-on-a-dedicated-host.md) | DKG daemon, GROBID and RPC proxy on their own host; Caddy is the only HTTP entry and every route needs auth; node keys backed up off the host |

## Rating model

| ADR | Decision |
| --- | --- |
| [0007. A rating is a separate R-KA, linked by schema:about](0007-a-rating-is-a-separate-r-ka.md) | A rating is its own R-KA linked by `schema:about`; the target KA is never modified |
| [0008. Ratings evolve in three phases](0008-ratings-evolve-in-three-phases.md) | Machine score, then human review, then wet-lab; one score per phase, written once |
| [0009. A paper can have several ratings](0009-several-ratings-per-paper.md) | A rating is identified by its request id and R-KA UAL; rating count is a number |
| [0010. The contract owns scores, the DKG owns content](0010-contract-owns-scores-dkg-owns-content.md) | The UI shows the contract's score and flags a gap with the DKG |
| [0011. Rating requests are free on testnet](0011-rating-requests-are-free-on-testnet.md) | Requesters pay only their gas; per-requester cap and a throttle bound spend; superseded before mainnet |

## DKG writes and recovery

| ADR | Decision |
| --- | --- |
| [0012. Asset names derive from the on-chain request id](0012-asset-names-derive-from-request-id.md) | Each request gets its own v2 id, bound to requester and target; rating asset names and recovery derive from it, never from a browser |
| [0013. Every write converges: store, mint and fulfil](0013-all-writes-converge.md) | Each write reads state first and treats "already done" as success; nothing is regenerated on retry |
| [0014. Mints are async, polled in short steps](0014-mints-are-async-polled-in-short-steps.md) | `vm/publish-async` polled with `step.sleep`, falling back to asset state if the job id is lost |
| [0015. Retries are spaced with step.sleep](0015-retries-are-spaced-with-step-sleep.md) | Explicit `step.sleep`, never `RetryAfterError` in `step.run`; start at 2 min, 5 attempts, 45 min |
| [0016. A cron reconciler recovers stuck requests](0016-a-cron-reconciler-recovers-stuck-requests.md) | One singleton function per request id, started by webhook or cron; scores only if nothing is stored; cancels past a maximum age |
| [0020. Oracle transactions are serialized](0020-oracle-transactions-are-serialized.md) | One dedicated function reads, sends and confirms every oracle transaction, one at a time, replacing stuck ones; key only on `develop` and `main` |
| [0021. Chain events are ingested at least once](0021-chain-events-are-ingested-at-least-once.md) | Raw-body HMAC check, dedup by request id (24 h), ack only after hand-off, `removed` logs ignored, request re-read on chain; the reconciler heals misses |

## Pipelines

| ADR | Decision |
| --- | --- |
| [0017. PDFs become Target KAs in a stepped pipeline](0017-pdf-to-target-ka-pipeline.md) | Browser uploads to IPFS by signed URL; GROBID, LLM extraction, store, mint as steps; named from the PDF's CID, which events carry instead of bytes |
| [0018. The phase-1 scorer has a fixed output contract](0018-phase-1-scorer-output-contract.md) | `{ score, rationale, observed, missing }`, schema-validated, computed once and read back; the model is configuration |

## App

| ADR | Decision |
| --- | --- |
| [0019. Server reads and actions return typed results](0019-server-reads-return-typed-results.md) | Never throw expected failures to the client, never swallow them into empty data |

## Open questions

Not decided yet. Each becomes an ADR in the plan that first needs the answer; the leaning is a starting point, not a decision.

| Question | Leaning | Decided in |
| --- | --- | --- |
| How does the UI list a paper's ratings? | The contract indexes request ids by target (`ratingsOf`), the authority for existence and scores ([0010](0010-contract-owns-scores-dkg-owns-content.md)); the DKG serves R-KA content on demand. `eth_getLogs` is ruled out ([domain](../domain.md)); an indexer only if reads outgrow view calls. | contracts plan |
| How do users authenticate? | Wallet connection via Reown AppKit + wagmi, as in the previous repo; on-chain requests need nothing more. Server actions that spend money (upload URLs, [0017](0017-pdf-to-target-ka-pipeline.md)) need a SIWE (EIP-4361) session to rate-limit per address. | first web plan with a wallet |
| Where do alerts go? | One channel the maintainer reads (chat bot webhook) behind a single `notify()`; a scheduled function checks wallet balances and orphans ([0011](0011-rating-requests-are-free-on-testnet.md), [0013](0013-all-writes-converge.md), [0016](0016-a-cron-reconciler-recovers-stuck-requests.md)); an external uptime check polls the node's `/api/status`. | agents plan |
| Is the contract upgradeable? | No proxy on testnet: fixes redeploy, and the app reads a list of contract addresses (current plus read-only past ones). Ids include the contract address, so deployments never collide ([0012](0012-asset-names-derive-from-request-id.md)). | contracts plan |

## Adding an ADR

1. Take the next number (`0022`, …) and name the file `NNNN-kebab-title.md`.
2. Put it in the group it belongs to (or a new one). Use the same headings as the others: a title `# NNNN. Title`, then `Status` and `Date`,
   then `## Context`, `## Decision`, `## Consequences`. Keep it under a page.
3. Add a row to its group's table, and commit it with the plan that took the decision
   (scope `docs`, or the workspace it governs).
4. If it answers an open question, remove that row in the same commit.

Never edit an accepted ADR's decision. To change it, write a new ADR that supersedes it,
and set the old one's status to `Superseded by NNNN` (the only edit an accepted ADR gets).
