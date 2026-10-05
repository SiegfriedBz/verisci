# Architecture decision records

Each file records one decision already taken: why, what, and what it costs. Plans cite
them instead of re-arguing them. Facts about the systems verisci runs on (DKG, chain,
Inngest, Vercel, tooling) live in [`docs/domain.md`](../domain.md).

An ADR states the decision and its reason. The mechanics (timeouts, fee bumps, reading
lists in chunks, exact checks) belong in the plan that builds them, where code and tests
confirm them.

Groups follow reading order: tools, environments, how writes behave, then the publish
flow before the rating flow that builds on it. Numbers follow the order decisions were
taken, so a later ADR can sit in an earlier group.

## Tools

| ADR | Decision |
| --- | --- |
| [0001. Toolchain: Biome, TypeScript 6, Soldeer, exact pins](0001-toolchain-biome-ts6-soldeer-exact-pins.md) | Biome replaces ESLint and Prettier; TypeScript 6.0.x; Soldeer; solc 0.8.37; every dependency pinned exactly |
| [0002. Internal packages ship TypeScript source](0002-internal-packages-ship-typescript-source.md) | Packages export `src/*.ts` with no build step; relative imports keep `.ts` |
| [0003. Inngest workflows live in the agents package](0003-inngest-workflows-live-in-agents.md) | Inngest functions live in `@verisci/agents`; `web` only serves them at `/api/inngest` |
| [0025. Reviews gate on ADR consistency and Foundry lint](0025-reviews-gate-on-adrs-and-lint.md) | Each branch review checks what it touches against accepted ADRs and blocks on a conflict until the user decides; a full ADR check runs on demand; every Foundry lint warning and note fails the checks |

## Environments and infrastructure

| ADR | Decision |
| --- | --- |
| [0004. Each workspace declares its own env variables](0004-each-workspace-declares-its-env.md) | `defineEnv` per workspace; fails fast, never shows values; `APP_ENV` required in production builds (amended by [0029](0029-forge-reads-the-root-env-file.md)) |
| [0005. Staging and production use separate resources](0005-staging-and-production-are-isolated.md) | Separate contract, graph, webhook, oracle wallet and Inngest environment per environment; the DKG node (its wallet and admin token) is shared, so a `-prod` guard protects production |
| [0006. The DKG node runs on a dedicated host](0006-dkg-node-runs-on-a-dedicated-host.md) | DKG daemon, GROBID and RPC proxy on their own host behind Caddy, every route but `/api/status` authenticated; node keys backed up off the host |
| [0023. The contract is not upgradeable](0023-contract-is-not-upgradeable.md) | No proxy: a fix redeploys; the app reads the current address and past ones read-only; ids never collide across deployments (amended by [0027](0027-past-contracts-are-paused-and-drained.md)) |
| [0027. Past contracts are paused and drained](0027-past-contracts-are-paused-and-drained.md) | The owner can pause new requests; after a redeploy the old contract is paused and the backend settles what is still pending on it; amends what "read-only" means in 0023 |
| [0028. Deployed addresses are committed](0028-deployed-addresses-are-committed.md) | Staging's and production's current and past contract addresses live in a committed file in the contracts package, changed only after a deploy through a reviewed PR; local test runs are for the agents plan |
| [0029. Forge reads the root env file](0029-forge-reads-the-root-env-file.md) | Forge reads the same root env file as the app; its settings are listed in `.env.example` with no `src/env.ts`; per-deploy choices go on the command; amends 0004 |

## Writing to the DKG

How every store, mint and on-chain write behaves; both flows below rely on it.

| ADR | Decision |
| --- | --- |
| [0007. Every write converges: store, mint, fulfil and cancel](0007-all-writes-converge.md) | Each write reads state first and treats "already done" as success; nothing is regenerated on retry |
| [0008. Mints are async, polled in short steps](0008-mints-are-async-polled-in-short-steps.md) | `vm/publish-async` polled with `step.sleep`; an asset stored by an earlier run gets time to finish minting before a new publish |
| [0009. Retries are spaced with step.sleep](0009-retries-are-spaced-with-step-sleep.md) | Explicit `step.sleep`, never `RetryAfterError` in `step.run`; start at 2 min, 5 attempts, 45 min |

## Publish flow

A PDF becomes a Target KA.

| ADR | Decision |
| --- | --- |
| [0010. PDFs become Target KAs in a stepped pipeline](0010-pdf-to-target-ka-pipeline.md) | Browser uploads to IPFS by signed URL; the submitter signs the CID (EIP-712) and the KA records it; GROBID, LLM, store and mint as steps; named from the PDF's CID |

## What a rating is

| ADR | Decision |
| --- | --- |
| [0011. A rating is a separate R-KA, linked by schema:about](0011-a-rating-is-a-separate-r-ka.md) | One R-KA per rating, linked to its target by `schema:about`, minted in phase 1 and updated by later phases; the target is never modified |
| [0012. Ratings evolve in three phases](0012-ratings-evolve-in-three-phases.md) | Machine score, then human review, then wet-lab; one score per phase, written once (amended by [0026](0026-the-oracle-settles-every-phase-on-chain.md)) |
| [0013. A paper can have several ratings](0013-several-ratings-per-paper.md) | A rating is identified by its phase-1 request id and its R-KA's UAL; rating count is a number |
| [0014. The contract owns scores, the DKG owns content](0014-contract-owns-scores-dkg-owns-content.md) | The UI shows the contract's score and flags a gap with the DKG |
| [0022. The contract indexes request ids by target](0022-contract-indexes-request-ids-by-target.md) | Request ids listed per target UAL, oldest first, by view call; an indexer only if view calls stop being enough |
| [0026. The oracle settles every phase on chain](0026-the-oracle-settles-every-phase-on-chain.md) | The oracle agent records every phase's result on the contract; reviewers and labs send their input to our backend; amends who writes phases 2 and 3 in 0012 |

## Rating flow

In the order a request lives: requested, named, ingested, scored, fulfilled, and recovered if stuck.

| ADR | Decision |
| --- | --- |
| [0015. Rating requests are free on testnet](0015-rating-requests-are-free-on-testnet.md) | Requesters pay only their gas; a per-requester cap and a throttle bound spend; superseded before mainnet |
| [0016. Asset names derive from the on-chain request id](0016-asset-names-derive-from-request-id.md) | Each rating request (phase 1) gets its own id, bound to requester and target; a rating's R-KA name and recovery derive from its phase-1 request id, never from a browser |
| [0017. Chain events are ingested at least once](0017-chain-events-are-ingested-at-least-once.md) | Signed webhooks, one event per request id, ack only after hand-off, removed logs ignored; the reconciler heals misses |
| [0018. The phase-1 scorer has a fixed output contract](0018-phase-1-scorer-output-contract.md) | `{ score, rationale, observed, missing }`, schema-validated, computed once and read back; the model is configuration |
| [0019. Oracle transactions are serialized](0019-oracle-transactions-are-serialized.md) | One function sends every oracle transaction, one at a time, replacing stuck ones; only `main` and `develop` hold the production and staging oracle keys |
| [0020. A cron reconciler recovers stuck requests](0020-a-cron-reconciler-recovers-stuck-requests.md) | One singleton run per request finishes what is left, and past a maximum age fulfils if minted or cancels; a cron only restarts stuck requests from the contract's pending set (amended by [0024](0024-only-the-oracle-cancels-requests.md)) |
| [0024. Only the oracle cancels requests](0024-only-the-oracle-cancels-requests.md) | Cancel reasons say why (maximum age, invalid target); the owner replaces the oracle in an emergency; amends the "owner" reason of 0020 |
| [0030. The owner and the oracle are different addresses](0030-owner-and-oracle-are-different-addresses.md) | The contract rejects an oracle equal to the owner and ownership moving to the oracle; each environment has a deployer (owner, offline) and an oracle (key on its deployment) |

## App

| ADR | Decision |
| --- | --- |
| [0021. Server reads and actions return typed results](0021-server-reads-return-typed-results.md) | Never throw expected failures to the client, never swallow them into empty data |

## Open questions

Not decided yet. Each becomes an ADR in the plan that first needs the answer; the leaning is a starting point, not a decision.

| Question | Leaning | Decided in |
| --- | --- | --- |
| How do users authenticate? | Wallet connection (Reown AppKit + wagmi). A submission is authorized by its EIP-712 signature ([0010](0010-pdf-to-target-ka-pipeline.md)), and rate limits key on the signing address; a SIWE session only if sign-in sessions are ever needed. | first web plan with a wallet |
| Where do alerts go? | One chat-bot channel behind a single `notify()`, fed by a scheduled check (wallet balances, orphans, age of the oldest pending request) and an uptime check on the node's `/api/status`. | agents plan |
| Where does mutable app state live? | Nowhere authoritative: the chain and the DKG hold the truth. Rate-limit counters go in one small key-value store (Upstash Redis); losing it only resets the limits. | first web plan with a wallet |
| Who may request phases 2 and 3? | Anyone, not only the phase-1 requester. Whoever requests, our node writes the R-KA update, since it owns the R-KA ([0012](0012-ratings-evolve-in-three-phases.md)). Also open: whether a later phase's request gets its own id or reuses the rating's. | phase-2 plan |
| How does a local test run target a developer's own contract? | One local-only address variable for that contract, read by the agents when `APP_ENV=local`; staging's and production's addresses stay in the committed file ([0028](0028-deployed-addresses-are-committed.md), [0019](0019-oracle-transactions-are-serialized.md)). | agents plan |
| Who holds the DKG node's credential? | Caddy keeps the daemon's admin token on the host and checks one credential per environment, so each can be revoked alone. The `-prod` guard stays ([0005](0005-staging-and-production-are-isolated.md)). | dkg plan |

## Adding an ADR

1. Take the next free number (one above the highest file in this folder) and name the file `NNNN-kebab-title.md`.
2. Put it in the group it belongs to (or a new one). Numbers are permanent once merged, so a new ADR takes the next number even if its group comes earlier.
3. Use the same headings as the others: a title `# NNNN. Title`, then `Status` and `Date`, then `## Context`, `## Decision`, `## Consequences`. Keep it short: the decision and why, not the mechanics.
4. Add a row to its group's table, and commit it on the branch of the plan that took the decision (scope `docs`, or the workspace it governs). If it answers an open question, remove that row in the same commit.

Never edit an accepted ADR's decision once merged. To change it, write a new ADR with the next number, and link the two:

- The new ADR replaces all of the old one: the old one's status becomes `Superseded by NNNN`, and the new one's header gets `- Supersedes: NNNN`.
- The new ADR replaces part of the old one: the old one's status becomes `Amended by NNNN`, and the new one's header gets `- Amends: NNNN (what it changes)`. Note it on the old one's row in the table too.

The old ADR's status line is the only edit a merged ADR gets; git keeps its history.
