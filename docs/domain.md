# Domain facts

Hard-won facts about the systems verisci runs on, each written once so plans cite them
instead of rediscovering them. Decisions built on them are in [`docs/adr/`](adr/README.md).

Many facts were observed in the previous verisci repo; the DKG facts marked 10.0.22 were
re-checked on this repo's own node. Each section names the versions they were seen on:
when a version moves, re-check the facts before relying on them. Add a fact when you learn
one the hard way.

## DKG

Observed on OriginTrail V10 nodes (`10.0.16`, then `10.0.22` from 2026-10-09; `nodeRole:
edge`, testnet), Base Sepolia.

- **A UAL has two shapes on V10,** chosen by the on-chain id (OriginTrail/dkg
  `packages/core/src/ka-ual-identity.ts`, checked at `abfd785`, 2026-09):
  - `did:dkg:base:{chainId}/{authorAddress}/{kaNumber}`: the V10 form. The author is the
    publishing agent's wallet, packed into the id's high 160 bits. Ours look like this: the
    previous repo's middle segment equals the node's agent address and has no contract code.
  - `did:dkg:base:{chainId}/{DKGKnowledgeAssets address}/{kaId}`: the older form, for ids
    with no author bits. OriginTrail's docs still show only this one.

  A UAL parser accepts both and never assumes the middle segment is our node: a target
  published elsewhere ([ADR 0011](adr/0011-a-rating-is-a-separate-r-ka.md)) may use either.
- **Canonical UAL spelling** (OriginTrail/dkg `packages/core/src/ka-ual-identity.ts`,
  checked at `74a515e`, 2026-10-06): lowercase address and chain namespace, decimal numbers
  with no leading zero; the chain part may be namespaced with several colons, and the chain
  number goes up to uint256. Id `0` is a valid canonical id there. Our parser keeps these
  rules but caps the chain number at `Number.MAX_SAFE_INTEGER`
  ([ADR 0031](adr/0031-uals-are-normalized-before-the-contract.md)).
- **Context graph ids** are the full `<agent address>/<name>`. A bare name refers to a
  different, local graph, so queries with it silently return nothing (`POST /api/query`
  with `verisci-staging` returned no rows on 10.0.22, 2026-10-09).
- **Asset names are scoped per context graph and per writing agent** (OriginTrail/dkg,
  checked at `74a515e`, 2026-10-07): a name is stored at
  `did:dkg:context-graph:<graph id>/assertion/<agent address>/<name>`
  (`packages/core/src/constants.ts`), so the same name in two graphs is two assets.
- **Asset name rules** (`validateAssertionName`, same file and commit): 1 to 256
  characters, no `/`, no whitespace and none of `<>"{}|^` `` ` `` `\`. A path segment
  starting with `did:dkg:` or matching `0x<40 hex>:<number>` is read as a KA id
  (`packages/cli/src/daemon/routes/knowledge-assets.ts`). Ours start with `verisci-`
  (`packages/core/README.md` → Asset names).
- **Publishing a KA is three calls on 10.0.22** (spike, 2026-10-09; all under
  `/api/knowledge-assets`, with `contextGraphId` in the body):
  1. `POST /api/knowledge-assets` with `name` and `quads` writes and seals a working-memory
     draft (`status: wm-sealed`) and reserves its UAL (`kaUal`); it shares only with
     `alsoShareSwm: true`.
  2. `POST …/{name}/swm/share` copies it to shared memory (under 2 s).
  3. `POST …/{name}/vm/publish` mints it: it returns `status: confirmed`, the `ual` and
     the `txHash`.

  Quads are `{ subject, predicate, object }` objects: IRIs bare, literals quoted
  (`"\"7\""`).
- **Read an asset's state with `GET …/{name}?contextGraphId=…`:** `state` is `created`
  (sealed draft, layer `WM`), `promoted` (shared, `SWM`) or `published` (minted, `VM`, with
  `publishedUal`); a name never stored answers 404. So does a graph the node does not
  serve, with the same body (`No knowledge asset "<name>" in context graph "<id>"`, no
  `code`), so only `GET /api/context-graph/list` tells them apart: it lists each graph's
  `id` and `subscribed` (10.0.22, 2026-10-09). Error bodies are `{ error, code }`. `reservedUal` is set from the first
  call, so a UAL being present does not mean minted: read `state`
  ([ADR 0007](adr/0007-all-writes-converge.md)). `GET …/{name}/wm/quads` returns the
  draft's quads.
- **A KA passes through three memory layers on 10.0.22:** a working-memory draft (`wm`:
  create, write, finalize), shared memory (`swm/share`, acknowledged by peers), then
  verifiable memory (`vm/publish`, the mint). `dkg ka create --share` runs the first two
  in one call.
- **Repeated writes are refused, with the first content kept** (spike, 2026-10-09):
  - storing a sealed name again answers 409 `KA_ASSERTION_ALREADY_FINALIZED` and keeps
    the first quads;
  - storing a minted name answers 409 `KA_WM_LIFECYCLE_REQUIRED`;
  - minting a name that is not shared, or is already minted, answers 409
    `PUBLISH_NOT_FULL_SHARE` for both, so only the state tells them apart.

  Each 409 is final: retrying it changes nothing, so the caller reads the state and goes
  on from there ([ADR 0007](adr/0007-all-writes-converge.md)).
- **A KA's id is fixed when it is sealed, so it is minted at most once** (spike,
  2026-10-09, run twice):
  - a second `vm/publish` sent 2 s into a running mint failed at gas estimation with
    `KaIdAlreadyMinted`, and the daemon answered 500 after 17 s;
  - three `vm/publish` calls sent at once were spread over the three publisher wallets
    in `~/.dkg/wallets.json`. One mint succeeded. A second reached the chain and
    reverted, still paying its gas. The third sent only a TRAC approval.

  So a 500 from `vm/publish` does not mean the asset is unminted: the caller reads the
  state before any retry. During a mint the state still reads `promoted`, so a poll
  cannot tell a mint in flight from none
  ([ADR 0008](adr/0008-mints-are-async-polled-in-short-steps.md)).
- **Mints outlive the client:** a `vm/publish` whose client disconnected after 2 s was
  minted anyway, its state reading `published` 13 to 16 s later (10.0.22, 2026-10-09,
  run twice; also seen on 10.0.16).
- **`vm/publish-async` needs the async publisher** (10.0.22, 2026-10-09). On our node,
  set up by `dkg init`, the route answers 503 `async_publisher_unavailable`
  (`publisher_disabled`, `retryable: false`). Read in the daemon source (10.0.22), not
  run: `dkg publisher enable` turns it on, and it starts only with at least one
  async-publisher wallet, added with `dkg publisher wallet add <private-key>` to
  `~/.dkg/publisher-wallets.json`, a file apart from `wallets.json`; jobs are read at
  `GET /api/publisher/job?id=…`. Whether one of the node's three publisher wallets can
  serve as that wallet is not checked
  ([ADR 0008](adr/0008-mints-are-async-polled-in-short-steps.md)).
- **Our node reads KAs from other nodes' context graphs** (spike, 2026-10-09):
  - `POST /api/context-graph/fetch-assets` on a graph the node is not subscribed to
    answers 404 ("does not exist or is not subscribed locally");
  - after `POST /api/context-graph/subscribe` with `syncMode: "on-demand"`, the same call
    with the graph id and the UALs (1 to 10 per call, per the daemon source) fetched the
    old verisci node's KAs 0 to 3, in 22 to 24 s per call, with that node off (so other
    peers presumably hold copies);
  - `/api/query` then read their triples.

  The graph id must be known: a UAL alone does not name its graph. Not checked: whether
  an on-demand subscription survives a restart, or must be listed in `config.json` like
  the node's own graphs ([ADR 0011](adr/0011-a-rating-is-a-separate-r-ka.md)).
- **Mint time varies from about 5 s to over 300 s** (13 to 17 s in the spike, 2026-10-09).
  A mint can also fail fast on quorum (`storage_ack_insufficient`,
  `CORE_TEMPORARILY_UNAVAILABLE`); retrying after a couple of minutes usually works
  ([ADR 0009](adr/0009-retries-are-spaced-with-step-sleep.md)).
- **The daemon has a single admin token:** one bearer token in `~/.dkg/auth.token`
  (written by `dkg init` on 10.0.16; on 10.0.22, 2026-10-09, by the first `dkg start`,
  with the agent key), valid for every graph on the node; there are no tokens scoped per
  graph, so whoever holds it can write every environment's graph ([ADR 0005](adr/0005-staging-and-production-are-isolated.md)).
- **Every context graph must be listed** under `contextGraphs` in the node's
  `~/.dkg/config.json`, or the node stops serving it after a restart.
- **A new graph reports `authority-resolution-failed` for up to about 20 minutes** (10.0.16).
  That is a slow chain read, not a bad registration: wait before re-registering. On
  10.0.22 (2026-10-09), `verisci-staging` reached `finalized-chain` right after
  registering, and about a minute after a restart.
- **Registering a context graph takes a 100 TRAC deposit** from the agent's wallet, plus
  gas (10.0.22, 2026-10-09). The CLI approves the deposit after decoding the contract's
  revert data, so an RPC path that drops a JSON-RPC error's `data` breaks registering.
- **The node's agent address is its first publisher wallet** (`wallets` in
  `~/.dkg/wallets.json`), not its admin wallet (10.0.22, 2026-10-09).
- **`dkg init` funds the node from OriginTrail's testnet faucet** (10.0.22): on
  2026-10-09 each wallet got 1,000 TRAC but no ETH, because the faucet had run out of ETH.
- **A KA keeps its UAL across updates** (OriginTrail/dkg
  `packages/evm-module/docs/greenfield-ka-ual.md`): the KA is minted to its author as an
  ERC-721 token, and each update adds a new immutable version under the same token. Only
  the owner (the token holder) can update it. On 10.0.22 (spike, 2026-10-09):
  - an update is `POST …/{name}/wm/pull-from` with `layer: "vm"`, which reopens a draft
    seeded with the minted quads;
  - `wm/write` then adds quads (it only appends; the spike found no call that removes
    one, so a later version still carries the earlier version's triples);
  - then `wm/finalize`, `swm/share` and `vm/publish`.

  The UAL and the KA id stayed the same and `assertionVersion` went to 2. A query then
  returns the latest version only ([ADR 0012](adr/0012-three-phases-settled-by-the-oracle.md)).
- **KA numbers are counted per author** and reserved at store time (the `reservedUal`).
  Both our graphs publish as one author, and a stored asset that is never minted keeps
  its number, so each environment sees gaps in its numbering. Expected, not a bug.
- **Authority resolution needs the node's local JSON-RPC proxy:** public Base Sepolia
  endpoints are not reliable enough for it.
- **Public Base Sepolia endpoints' log limits** (2026-10-09): `sepolia.base.org` answers
  `eth_getLogs` over at most 200 blocks; `base-sepolia-rpc.publicnode.com` over 2,000, but
  keeps history from block 46,500,000 only ("pruned history unavailable").
- **The daemon reads the chain constantly** (previous host, DKG 10.0.16, two graphs,
  2026-09 to 2026-10): it re-resolves each graph's authority from chain history again and
  again. With every call except log reads sent to Alchemy first and no limit, Alchemy's free
  tier was used up after a few weeks; from about 2026-10-05 the chain head froze and every
  write failed, while `/api/status` still answered. The proxy now keeps Alchemy last,
  within a daily budget (`infra/rpc-proxy`). Unverified: whether a later release reads
  less.

## IPFS

CID facts checked with `multiformats` 14.0.5, 2026-10-07; import defaults from the Kubo
docs, current at 2026-10-07. The settings Pinata's signed-URL uploads use are still to be
checked.

- **One file has several CIDs, depending on the import settings:** CID version, raw
  leaves or UnixFS leaves, and the chunker. Kubo's default gives a CIDv0 (`Qm…`, dag-pb);
  with CIDv1 and raw leaves, a file that fits in one chunk gives a `bafkrei…` CID (raw
  codec), and a larger file a `bafybei…` CID (dag-pb root). The uploader picks the
  settings, so one PDF keeps one CID only while every upload goes through the same
  uploader with the same settings ([ADR 0010](adr/0010-pdf-to-target-ka-pipeline.md)).
- **One CID has several spellings:** CIDv0 (`Qm…`) and CIDv1 in base32 (`b…`), base58btc
  (`z…`) or base36 (`k…`). `CID.parse` reads all four, and `.toV1().toString()` writes
  base32. It refuses uppercase base32 (`B…`).
- **A valid CID can name any hash and any size:** `CID.parse` checks the format only. An
  identity-hash CID carries its data inline, so it can be hundreds of characters long.

## Chain

Observed on Base Sepolia (chain id 84532) with Alchemy.

- **Base produces a block every 2 seconds; a block is final only once its batch is final on
  L1,** minutes later. Reorgs before that are rare but possible (Base docs), which is why
  request ids are bound to their content ([ADR 0016](adr/0016-asset-names-derive-from-request-id.md)).
- **The free RPC tier caps `eth_getLogs` at 10 blocks,** so nothing may depend on scanning
  history; read current contract state instead ([ADR 0020](adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
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
  it, so the agents plan checks it on `develop` ([ADR 0020](adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
- **Only production and the stable `develop` deployment receive webhooks:** feature
  previews have no stable URL to register.
- **Inngest concurrency limits count running steps, not runs:** a run that is sleeping or
  waiting holds no slot, so a concurrency key cannot keep two functions (or two runs) off
  the same request ([ADR 0020](adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
- **Inngest `singleton` (mode `skip`) locks a whole run, sleeps included:** while a run for
  a key is active, new runs for that key are skipped (Inngest docs) ([ADR 0020](adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
- **Inngest deduplicates event ids for 24 hours only:** an event re-sent later with the
  same id starts a new run ([ADR 0017](adr/0017-chain-events-are-ingested-at-least-once.md)).
- **Inngest caps sizes:** an event payload at 256 KB, a step's output at 4 MB, a run's
  state at 32 MB and a function at 1,000 steps (Inngest docs, to verify on our plan).
  Payloads carry ids, never file bytes ([ADR 0010](adr/0010-pdf-to-target-ka-pipeline.md)).
- **Vercel Hobby runs cron jobs at most once a day,** at an imprecise time within the
  hour (Vercel docs), so schedules run as Inngest crons ([ADR 0020](adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
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
