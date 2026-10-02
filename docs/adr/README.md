# Architecture decision records

Each file records one decision already taken: why, what, and what it costs. Plans cite
them instead of re-arguing them. Facts about the systems verisci runs on (DKG, chain,
Inngest, Vercel, tooling) live in [`docs/domain.md`](../domain.md).

| ADR | Decision |
| --- | --- |
| [0001](0001-names-derive-from-chain-state.md) Names derive from chain state | Each request gets its own on-chain id; every DKG asset name and recovery derives from it; nothing load-bearing lives in a browser |
| [0002](0002-store-then-mint.md) Store, then mint | Publishing is two daemon calls; the mint reads the asset's `state` first and returns the existing UAL if already minted |
| [0003](0003-short-steps-async-mint.md) Short steps, async mint | No step holds a connection longer than one poll; mints use `vm/publish-async` polled with `step.sleep` |
| [0004](0004-explicit-retry-spacing.md) Explicit retry spacing | Retry delays are an explicit `step.sleep`, never a `RetryAfterError` inside `step.run`; start at 2 min, 5 attempts, 45 min |
| [0005](0005-results-not-throws.md) Results, not throws | Server reads and actions return typed results; they never throw to the client or swallow errors into empty data |
| [0006](0006-two-sources-of-truth-one-each.md) Two sources of truth, one each | The contract owns scores, the DKG owns content; the UI shows the contract's score and flags a gap |
| [0007](0007-ratings-are-plural-ready.md) Ratings are plural-ready | A rating's identity is its own request id and R-KA UAL; rating count is a number, never a boolean |
| [0008](0008-environment-isolation.md) Environment isolation | Production and staging have separate contracts, graphs, webhooks, wallets and keys; the node host is shared; `APP_ENV` names the environment |
| [0009](0009-env-declared-where-it-is-read.md) Env declared where it is read | Each workspace declares its own variables with `defineEnv`; validation fails fast and never shows values |
| [0010](0010-one-reconciler-owns-recovery.md) One reconciler owns recovery | One cron workflow finishes or cancels stuck requests; the v2 contract lists pending request ids |
| [0011](0011-workflows-live-in-agents.md) Workflows live in agents | Inngest functions live in `@verisci/agents`; `web` only serves them at `/api/inngest` |
| [0012](0012-packages-ship-source.md) Packages ship source | Packages export `src/*.ts` with no build step; relative imports keep `.ts` |
| [0013](0013-tooling-choices.md) Tooling choices | Biome, TypeScript 6.0.x, Soldeer, solc 0.8.37, exact pins |
| [0014](0014-ratings-are-separate-r-kas.md) Ratings are separate R-KAs | A rating is its own R-KA linked by `schema:about`; the target KA is never modified |
| [0015](0015-three-phase-rating.md) Three-phase rating | Machine score, then human review, then wet-lab; one score per phase, written once |
| [0016](0016-node-host-topology.md) Node host topology | DKG daemon, GROBID and RPC proxy run on their own host behind Caddy |
| [0017](0017-payment-model-v0.md) Payment model V0 | Requests are free and the oracle pays; testnet only, superseded before mainnet |
| [0018](0018-phase-1-scorer-contract.md) Phase-1 scorer contract | The scorer returns `{ score, rationale, observed, missing }` deterministically; the model is configuration |
| [0019](0019-publish-pipeline.md) Publish pipeline | PDF → IPFS pin → GROBID → LLM extraction → store → mint, one workflow step each |

## Adding an ADR

1. Take the next number (`0020`, …) and name the file `NNNN-kebab-title.md`.
2. Use the same headings as the others: a title `# NNNN. Title`, then `Status` and `Date`,
   then `## Context`, `## Decision`, `## Consequences`. Keep it under a page.
3. Add a row to the table above, and commit it with the plan that took the decision
   (scope `docs`, or the workspace it governs).

Never edit an accepted ADR's decision. To change it, write a new ADR that supersedes it,
and set the old one's status to `Superseded by NNNN` (the only edit an accepted ADR gets).
