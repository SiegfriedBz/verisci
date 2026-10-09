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
| [0001. Toolchain: Biome, TypeScript 6, Soldeer, exact pins](0001-toolchain-biome-ts6-soldeer-exact-pins.md) | Biome, TypeScript 6, Soldeer and solc 0.8.37; every dependency pinned exactly |
| [0002. Internal packages ship TypeScript source](0002-internal-packages-ship-typescript-source.md) | Packages export their `.ts` source, with no build step; programs on the DKG node server run theirs with plain Node |
| [0003. Inngest workflows live in the agents package](0003-inngest-workflows-live-in-agents.md) | Inngest functions live in `agents`; `web` only serves them |
| [0025. Reviews gate on ADR consistency and Foundry lint](0025-reviews-gate-on-adrs-and-lint.md) | A review blocks on an ADR conflict until the user decides; every Foundry lint warning fails |

## Environments and infrastructure

| ADR | Decision |
| --- | --- |
| [0004. Env variables are declared per workspace, in one root file](0004-env-variables-per-workspace-one-root-file.md) | Each workspace validates the variables it reads; forge reads the same root env file; programs on the DKG node server read their own |
| [0005. Staging and production use separate resources](0005-staging-and-production-are-isolated.md) | Each environment has its own contract, graph, webhook, oracle wallet and Inngest environment; the DKG node is shared, so a `-prod` guard protects production |
| [0006. The DKG node runs on a dedicated host](0006-dkg-node-runs-on-a-dedicated-host.md) | The node, GROBID and an RPC proxy run on their own host, behind authentication, with keys backed up; on a developer's computer until a deployed environment calls the node |
| [0023. A fix is a redeploy, and the owner's powers are fixed](0023-a-fix-is-a-redeploy-owner-powers-fixed.md) | A fix is a redeploy; old contracts are paused and drained; the owner sets the oracle and cap, pauses and unpauses, and transfers ownership in two steps, never to the oracle, with no renounce |
| [0028. Deployed addresses are committed](0028-deployed-addresses-are-committed.md) | Every environment's contract addresses live in a committed file, changed by a reviewed PR |
| [0030. The owner and the oracle are different addresses](0030-owner-and-oracle-are-different-addresses.md) | The owner's key stays offline; the oracle's key is on the deployment; the contract keeps them apart |

## Writing to the DKG

How every store, mint and on-chain write behaves; both flows below rely on it.

| ADR | Decision |
| --- | --- |
| [0007. Every write converges: store, mint, fulfil and cancel](0007-all-writes-converge.md) | Each write reads state first and treats "already done" as success |
| [0008. Mints are started, then polled in short steps](0008-mints-are-async-polled-in-short-steps.md) | A step starts the mint and stops listening before the time limit; the asset's state is polled, and no run waits for an earlier mint |
| [0009. Retries are spaced with step.sleep](0009-retries-are-spaced-with-step-sleep.md) | Retries wait with `step.sleep`: from 2 minutes, 5 attempts, 45 minutes in all |

## Publish flow

A PDF becomes a Target KA.

| ADR | Decision |
| --- | --- |
| [0010. PDFs become Target KAs in a stepped pipeline](0010-pdf-to-target-ka-pipeline.md) | Signed upload, signed CID, then parse, store and mint as steps, metadata read by code; named from the CID, first submitter kept |

## What a rating is

| ADR | Decision |
| --- | --- |
| [0011. A rating is a separate R-KA, linked by schema:about](0011-a-rating-is-a-separate-r-ka.md) | Each rating is its own R-KA pointing at the paper; the paper is never modified |
| [0012. Ratings evolve in three phases, each settled by the oracle](0012-three-phases-settled-by-the-oracle.md) | Machine score, human review, wet-lab; the oracle records every phase's score |
| [0013. A paper can have several ratings](0013-several-ratings-per-paper.md) | A rating is identified by its request id and its R-KA's UAL |
| [0014. The contract owns scores, the DKG owns content](0014-contract-owns-scores-dkg-owns-content.md) | The UI shows the contract's score and flags a gap with the DKG |
| [0022. The contract indexes request ids by target](0022-contract-indexes-request-ids-by-target.md) | The contract lists each paper's request ids, oldest first, read by view calls |
| [0031. UALs are normalized before they reach the contract](0031-uals-are-normalized-before-the-contract.md) | Every UAL takes one canonical spelling before it is used; leading zeros are refused; the oracle cancels other spellings |

## Rating flow

In the order a request lives: requested, named, ingested, scored, fulfilled, and recovered if stuck.

| ADR | Decision |
| --- | --- |
| [0015. Rating requests are free on testnet](0015-rating-requests-are-free-on-testnet.md) | Requesters pay only gas; a cap and a throttle bound spend until mainnet |
| [0016. Asset names derive from the on-chain request id](0016-asset-names-derive-from-request-id.md) | Each phase-1 request has an on-chain id; any process computes the rating's name and its recovery from it alone |
| [0017. Chain events are ingested at least once](0017-chain-events-are-ingested-at-least-once.md) | Signed webhooks, one event per request id, acked only after hand-off; the reconciler heals what is missed |
| [0018. The phase-1 scorer has a fixed output contract](0018-phase-1-scorer-output-contract.md) | The scorer returns `{ score, rationale, observed, missing }`, computed once and read back |
| [0019. Oracle transactions are serialized](0019-oracle-transactions-are-serialized.md) | One function sends every oracle transaction, one at a time; only `main` and `develop` hold the oracle keys |
| [0020. Stuck requests are recovered, and only the oracle cancels](0020-stuck-requests-recovered-only-oracle-cancels.md) | One run per request finishes what is left; a cron restarts stuck ones; only the oracle cancels |

## App

| ADR | Decision |
| --- | --- |
| [0021. Server reads and actions return typed results](0021-server-reads-return-typed-results.md) | Expected failures come back as typed results that the caller handles |

## Folded ADRs

Each was folded into the ADR that covers its topic. Their numbers stay retired, so old commits and PRs that cite them lead here.

| Was | Now in |
| --- | --- |
| 0024. Only the oracle cancels requests | [0020](0020-stuck-requests-recovered-only-oracle-cancels.md) |
| 0026. The oracle settles every phase on chain | [0012](0012-three-phases-settled-by-the-oracle.md) |
| 0027. Past contracts are paused and drained | [0023](0023-a-fix-is-a-redeploy-owner-powers-fixed.md) |
| 0029. Forge reads the root env file | [0004](0004-env-variables-per-workspace-one-root-file.md) |
| 0032. The owner can transfer ownership | [0023](0023-a-fix-is-a-redeploy-owner-powers-fixed.md) |
| 0033. The owner can unpause new requests | [0023](0023-a-fix-is-a-redeploy-owner-powers-fixed.md) |

## Open questions

Not decided yet. Each becomes an ADR in the plan that first needs the answer; the leaning is a starting point, not a decision.

| Question | Leaning | Decided in |
| --- | --- | --- |
| How do users authenticate? | Wallet connection (Reown AppKit + wagmi). A submission is authorized by its EIP-712 signature ([0010](0010-pdf-to-target-ka-pipeline.md)), and rate limits key on the signing address; a SIWE session only if sign-in sessions are ever needed. | first web plan with a wallet |
| Where do alerts go? | One chat-bot channel behind a single `notify()`, fed by a scheduled check (wallet balances, orphans, age of the oldest pending request) and an uptime check on the node's `/api/status`. | agents plan |
| Where does mutable app state live? | Nowhere authoritative: the chain and the DKG hold the truth. Rate-limit counters go in one small key-value store (Upstash Redis); losing it only resets the limits. | first web plan with a wallet |
| Who may request phases 2 and 3? | Anyone, not only the phase-1 requester. Whoever requests, our node writes the R-KA update, since it owns the R-KA ([0012](0012-three-phases-settled-by-the-oracle.md)). Also open: whether a later phase's request gets its own id or reuses the rating's. | phase-2 plan |
| How does a local test run target a developer's own contract? | One local-only address variable for that contract, read by the agents when `APP_ENV=local`; staging's and production's addresses stay in the committed file ([0028](0028-deployed-addresses-are-committed.md), [0019](0019-oracle-transactions-are-serialized.md)). | agents plan |
| How does a rating run find the context graph of a target verisci did not publish? | The rating request names it next to the target's UAL, since a UAL alone does not name its graph ([0011](0011-a-rating-is-a-separate-r-ka.md)); check first whether a later DKG release resolves a UAL to its graph. | agents plan |
| Who holds the DKG node's credential? | Caddy keeps the daemon's admin token on the host and checks one credential per environment, so each can be revoked alone. The `-prod` guard stays ([0005](0005-staging-and-production-are-isolated.md)). | node server plan |

## Adding an ADR

1. Take the next free number (one above the highest number used, Folded ADRs included) and name the file `NNNN-kebab-title.md`.
2. Put it in the group it belongs to (or a new one). Numbers are permanent once the PR is merged, so a new ADR takes the next number even if its group comes earlier.
3. Use the same headings as the others: a title `# NNNN. Title`, then `Status` and `Date`, then `## Context`, `## Decision`, `## Consequences`. Keep it short: the decision and why, not the mechanics.
4. Add a row to its group's table, and commit it on the branch of the plan that took the decision (scope `docs`, or the workspace it governs). If it answers an open question, remove that row in the same commit.

## Changing an ADR

An ADR states what is decided today, so each topic reads in one file.

- **A new topic gets a new ADR.**
- **A new choice on a topic an ADR already covers, a change to part of its decision, or a correction** goes into that ADR: rewrite it so it reads as the current decision, and add a dated line under `## History` at its end (`- 2026-10-07: what changed, and why`). A correction that keeps the decision, such as a forgotten word or an incomplete list, says "corrected". A choice that touches two ADRs' topics updates both, each with its History line.
- **A whole decision replaced** gets a new ADR: the old one's status becomes `Superseded by NNNN`, and the new one's header gets `- Supersedes: NNNN`.
- **Folding:** when one ADR's topic is part of another's, its text moves into that ADR, with a History line, its file is deleted, and its number is listed under Folded ADRs. Each number names one ADR for good.
- Every change is the user's call and goes through a reviewed PR; amending an ADR, in [0025](0025-reviews-gate-on-adrs-and-lint.md)'s sense, means this in-place change. Git keeps the full text of each version.
- A folded ADR's number stays cited in History lines, in the Folded ADRs table, and in the contract's NatSpec until its next redeploy, so the deployed source stays the one verified on Basescan.
