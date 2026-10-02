# Domain facts

Hard-won facts about the systems verisci runs on, each written once so plans cite them
instead of rediscovering them. Decisions built on them are in [`docs/adr/`](adr/README.md).

Most facts were observed in the previous verisci repo and cannot be re-checked from this
one. Each section names the versions they were seen on: when a version moves, re-check the
facts before relying on them. Add a fact when you learn one the hard way.

## DKG

Observed on an OriginTrail V10 node (`10.0.16`, `nodeRole: edge`, testnet), Base Sepolia.

- **UAL shape:** `did:dkg:base:{chainId}/{dkgAgentAddress}/{tokenId}`. The middle segment
  is the node's agent wallet, not a contract; naming it after a contract caused confusion.
- **Context graph ids** are the full `<agent address>/<name>`. A bare name refers to a
  different, local graph, so queries with it silently return nothing.
- **Store and mint are separate calls:** `POST /api/knowledge-assets`, then
  `…/{name}/vm/publish`. Asset states are missing, stored (`promoted`) and minted
  (`published`); only `publishedUal` means minted ([ADR 0013](adr/0013-all-writes-converge.md)).
- **Mints outlive the client:** the daemon finishes a mint after the client disconnects,
  and `vm/publish-async` returns a job id to poll ([ADR 0014](adr/0014-mints-are-async-polled-in-short-steps.md)).
- **Mint time varies from about 5 s to over 300 s.** A mint can also fail fast on quorum
  (`storage_ack_insufficient`, `CORE_TEMPORARILY_UNAVAILABLE`); retrying after a couple of
  minutes usually works ([ADR 0015](adr/0015-retries-are-spaced-with-step-sleep.md)).
- **The daemon has a single admin token:** `dkg init` writes one bearer token to
  `~/.dkg/auth.token`, valid for every graph on the node; there are no tokens scoped per
  graph. Caddy serves `/api/status` without it.
- **Every context graph must be listed** under `contextGraphs` in the node's
  `~/.dkg/config.json`, or the node stops serving it after a restart.
- **A new graph reports `authority-resolution-failed` for up to about 20 minutes.** That is
  a slow chain read, not a bad registration: wait before re-registering.
- **Token ids are global:** OriginTrail's shared contract mints them for every node and
  environment, so each environment sees gaps in its numbering. Expected, not a bug.
- **Authority resolution needs the node's local JSON-RPC proxy:** public Base Sepolia
  endpoints are not reliable enough for it.

## Chain

Observed on Base Sepolia (chain id 84532) with Alchemy.

- **The free RPC tier caps `eth_getLogs` at 10 blocks,** so nothing may depend on scanning
  history; read current contract state instead ([ADR 0016](adr/0016-a-cron-reconciler-recovers-stuck-requests.md)).
- **Alchemy delivers a log to every webhook rule matching its contract:** keep exactly one
  rule per contract, or one request reaches two oracles.
- **The webhook route verifies the HMAC with its environment's secret:** a mismatch is a
  401, and repeated 401s mean a secret swapped between environments.

## Inngest and Vercel

Observed on Vercel Hobby with Inngest Cloud, except where a fact cites the vendor's docs.

- **Vercel Hobby stops any function at 300 s,** which is shorter than a slow mint.
- **Inngest keys:** Production has its own pair; all branch environments share one other
  pair, and the SDK picks the branch from `VERCEL_GIT_COMMIT_REF`.
- **REST reads (run status) must send `x-inngest-env`** with the branch name, or they match
  nothing.
- **Preview deployments need Vercel's deployment-protection bypass** configured, or Inngest
  cannot reach `/api/inngest`.
- **Only production and the stable `develop` deployment receive webhooks:** feature
  previews have no stable URL to register.
- **Inngest concurrency limits count running steps, not runs:** a run that is sleeping or
  waiting holds no slot, so a concurrency key cannot keep two functions (or two runs) off
  the same request ([ADR 0016](adr/0016-a-cron-reconciler-recovers-stuck-requests.md)).
- **Inngest deduplicates event ids for 24 hours only:** an event re-sent later with the
  same id starts a new run ([ADR 0021](adr/0021-chain-events-are-ingested-at-least-once.md)).
- **Vercel caps a function's request body at 4.5 MB** (Vercel docs, to verify on our
  plan). The previous repo raised the server-action limit to 5 MB, so uploads between 4.5
  and 5 MB likely failed with a 413 in production ([ADR 0017](adr/0017-pdf-to-target-ka-pipeline.md)).

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
