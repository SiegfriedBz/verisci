# Domain facts

Hard-won facts about the systems verisci runs on, each written once so plans cite them
instead of rediscovering them. Decisions built on them are in [`docs/adr/`](adr/README.md).

Most facts were observed in the previous verisci repo and cannot be re-checked from this
one. Each section names the versions they were seen on: when a version moves, re-check the
facts before relying on them. Add a fact when you learn one the hard way.

## DKG

Observed on an OriginTrail V10 node (`10.0.16`, `nodeRole: edge`, testnet), Base Sepolia.

- **A UAL has two shapes on V10,** chosen by the on-chain id (OriginTrail/dkg
  `packages/core/src/ka-ual-identity.ts`, checked at `abfd785`, 2026-09):
  - `did:dkg:base:{chainId}/{authorAddress}/{kaNumber}`: the V10 form. The author is the
    publishing agent's wallet, packed into the id's high 160 bits. Ours look like this: the
    previous repo's middle segment equals the node's agent address and has no contract code.
  - `did:dkg:base:{chainId}/{DKGKnowledgeAssets address}/{kaId}`: the older form, for ids
    with no author bits. OriginTrail's docs still show only this one.

  A UAL parser accepts both and never assumes the middle segment is our node: a target
  published elsewhere ([ADR 0011](adr/0011-a-rating-is-a-separate-r-ka.md)) may use either.
- **Context graph ids** are the full `<agent address>/<name>`. A bare name refers to a
  different, local graph, so queries with it silently return nothing.
- **Store and mint are separate calls:** `POST /api/knowledge-assets`, then
  `…/{name}/vm/publish`. Asset states are missing, stored (`promoted`) and minted
  (`published`). A stored asset already has a `reservedUal`, so a UAL being present does
  not mean minted: read `state` ([ADR 0007](adr/0007-all-writes-converge.md)).
- **Mints outlive the client:** the daemon finishes a mint after the client disconnects,
  and `vm/publish-async` returns a job id to poll ([ADR 0008](adr/0008-mints-are-async-polled-in-short-steps.md)).
- **Unverified: a second `vm/publish` while a mint is in flight.** An asset being minted
  still reads as stored; whether the daemon refuses a publish for it or mints twice is not
  known. Until checked, assume it could mint twice ([ADR 0008](adr/0008-mints-are-async-polled-in-short-steps.md)).
- **Unverified: reading KAs from other context graphs.** Whether our node can read a
  KA published to another node's context graph is not checked on V10; rating a target
  verisci did not publish depends on it ([ADR 0011](adr/0011-a-rating-is-a-separate-r-ka.md)).
- **Mint time varies from about 5 s to over 300 s.** A mint can also fail fast on quorum
  (`storage_ack_insufficient`, `CORE_TEMPORARILY_UNAVAILABLE`); retrying after a couple of
  minutes usually works ([ADR 0009](adr/0009-retries-are-spaced-with-step-sleep.md)).
- **The daemon has a single admin token:** `dkg init` writes one bearer token to
  `~/.dkg/auth.token`, valid for every graph on the node; there are no tokens scoped per
  graph, so whoever holds it can write every environment's graph ([ADR 0005](adr/0005-staging-and-production-are-isolated.md)).
- **Every context graph must be listed** under `contextGraphs` in the node's
  `~/.dkg/config.json`, or the node stops serving it after a restart.
- **A new graph reports `authority-resolution-failed` for up to about 20 minutes.** That is
  a slow chain read, not a bad registration: wait before re-registering.
- **A KA keeps its UAL across updates** (OriginTrail/dkg
  `packages/evm-module/docs/greenfield-ka-ual.md`): the KA is minted to its author as an
  ERC-721 token, and each update adds a new immutable version under the same token. Only
  the owner (the token holder) can update it. Unverified: the daemon API call for an update
  ([ADR 0012](adr/0012-ratings-evolve-in-three-phases.md)).
- **KA numbers are counted per author** and reserved at store time (the `reservedUal`).
  Both our graphs publish as one author, and a stored asset that is never minted keeps
  its number, so each environment sees gaps in its numbering. Expected, not a bug.
- **Authority resolution needs the node's local JSON-RPC proxy:** public Base Sepolia
  endpoints are not reliable enough for it.

## Chain

Observed on Base Sepolia (chain id 84532) with Alchemy.

- **Base produces a block every 2 seconds; a block is final only once its batch is final on
  L1,** minutes later. Reorgs before that are rare but possible (Base docs), which is why
  request ids are bound to their content ([ADR 0016](adr/0016-asset-names-derive-from-request-id.md)).
- **The free RPC tier caps `eth_getLogs` at 10 blocks,** so nothing may depend on scanning
  history; read current contract state instead ([ADR 0020](adr/0020-a-cron-reconciler-recovers-stuck-requests.md)).
- **Alchemy delivers a log to every webhook rule matching its contract:** keep exactly one
  rule per contract, or one request reaches two oracles.
- **Each Alchemy webhook signs with its own secret:** a route checking another
  environment's secret answers 401, so repeated 401s mean a secret swapped between
  environments ([ADR 0017](adr/0017-chain-events-are-ingested-at-least-once.md)).
- **Base has no public mempool:** the RPC forwards transactions to the sequencer, so
  whether Alchemy's pending nonce (`eth_getTransactionCount(…, "pending")`) shows a
  transaction not yet included is to verify ([ADR 0019](adr/0019-oracle-transactions-are-serialized.md)).
- **Replacing a pending transaction needs both `maxFeePerGas` and `maxPriorityFeePerGas`
  raised by at least 10%** (geth's default price bump; to verify on Base), or it is
  rejected as underpriced ([ADR 0019](adr/0019-oracle-transactions-are-serialized.md)).

## Inngest and Vercel

Observed on Vercel Hobby with Inngest Cloud, except where a fact cites the vendor's docs.

- **Vercel Hobby stops any function at 300 s,** which is shorter than a slow mint.
- **Inngest keys:** Production has its own pair; all branch environments share one other
  pair, and the SDK picks the branch from `VERCEL_GIT_COMMIT_REF`.
- **REST reads (run status) must send `x-inngest-env`** with the branch name, or they match
  nothing.
- **Preview deployments need Vercel's deployment-protection bypass** configured, or Inngest
  cannot reach `/api/inngest`. The stable `develop` deployment is a preview too, so the
  staging webhook needs the same bypass; a caller that cannot set headers passes it as the
  `x-vercel-protection-bypass` query parameter (Vercel docs, to verify on our plan).
- **Inngest archives a branch environment 3 days after its latest deploy** (Inngest docs),
  unless auto-archive is disabled for it in the dashboard. Archiving stops its functions
  from triggering, so staging stops after three quiet days on `develop` ([ADR 0005](adr/0005-staging-and-production-are-isolated.md)).
- **Unverified: cron functions in a branch environment.** Inngest's docs do not say
  whether a branch environment runs scheduled functions; staging's reconciler relies on
  it, so the agents plan checks it on `develop` ([ADR 0020](adr/0020-a-cron-reconciler-recovers-stuck-requests.md)).
- **Only production and the stable `develop` deployment receive webhooks:** feature
  previews have no stable URL to register.
- **Inngest concurrency limits count running steps, not runs:** a run that is sleeping or
  waiting holds no slot, so a concurrency key cannot keep two functions (or two runs) off
  the same request ([ADR 0020](adr/0020-a-cron-reconciler-recovers-stuck-requests.md)).
- **Inngest `singleton` (mode `skip`) locks a whole run, sleeps included:** while a run for
  a key is active, new runs for that key are skipped (Inngest docs) ([ADR 0020](adr/0020-a-cron-reconciler-recovers-stuck-requests.md)).
- **Inngest deduplicates event ids for 24 hours only:** an event re-sent later with the
  same id starts a new run ([ADR 0017](adr/0017-chain-events-are-ingested-at-least-once.md)).
- **Inngest caps sizes:** an event payload at 256 KB, a step's output at 4 MB, a run's
  state at 32 MB and a function at 1,000 steps (Inngest docs, to verify on our plan).
  Payloads carry ids, never file bytes ([ADR 0010](adr/0010-pdf-to-target-ka-pipeline.md)).
- **Vercel Hobby runs cron jobs at most once a day,** at an imprecise time within the
  hour (Vercel docs), so schedules run as Inngest crons ([ADR 0020](adr/0020-a-cron-reconciler-recovers-stuck-requests.md)).
- **Inngest's free plan allows 50,000 executions a month and 5 concurrent steps**
  (Inngest pricing): every step, poll and cron tick counts against the first, so poll
  and cron intervals and the rating throttle are set against it ([ADR 0008](adr/0008-mints-are-async-polled-in-short-steps.md),
  [ADR 0015](adr/0015-rating-requests-are-free-on-testnet.md)); every executing step
  holds one of the 5 (whether branch environments share them is to verify), so a long
  step such as waiting for a receipt delays every other workflow ([ADR 0019](adr/0019-oracle-transactions-are-serialized.md)).
- **Vercel caps a function's request body at 4.5 MB** (Vercel docs, to verify on our
  plan). The previous repo raised the server-action limit to 5 MB, so uploads between 4.5
  and 5 MB likely failed with a 413 in production ([ADR 0010](adr/0010-pdf-to-target-ka-pipeline.md)).

## Next.js

Observed on Next.js 16.3.8.

- **`NEXT_PUBLIC_*` values are inlined at build time,** and only when read literally
  (`process.env.NEXT_PUBLIC_X`); changing one needs a new deployment.
- **Next only loads env files from its own app directory.** `apps/web/next.config.ts`
  loads the repo-root files instead (see Tooling for why it needs `forceReload`).
- **Next watches only `apps/web` for env changes:** editing a root env file needs a dev
  server restart, and an env file left in `apps/web` can be reapplied on a dev reload.

## Tooling

Observed on Turbo 2.11, `@next/env` 16.3.8, `@t3-oss/env-core` 0.13 and Zod 4.6.

- **`@next/env` caches its first `loadEnvConfig`,** and Next has already loaded `apps/web`
  before it reads `next.config.ts`, so loading the root needs `forceReload`. Env values set
  while the config loads are copied into Next's startup snapshot, so they survive dev env
  reloads.
- **Turbo's strict env mode strips every variable a task does not declare:** shared ones go
  in `globalEnv`. Root env files must be build `inputs` (`$TURBO_ROOT$/.env*`) or a changed
  `.env.local` replays a stale build. Turbo hashes file content, not modification time.
- **`@t3-oss/env-core` has three traps:** `emptyStringAsUndefined` deletes keys from the
  object it is given (`process.env` by default), so `defineEnv` passes a copy; `extends`
  merges presets without validating them again; `skipValidation` returns the whole runtime
  env, secrets included, with no defaults.
- **Zod 4 reports a missing enum value as "Invalid option".** Give the schema its own
  `error` callback when "required" is what is actually wrong.
