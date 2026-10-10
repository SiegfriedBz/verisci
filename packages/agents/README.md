# @verisci/agents

Inngest workflows that combine `core` logic with the `dkg` and `contracts` adapters;
`apps/web` only serves them ([ADR 0003](../../docs/adr/0003-inngest-workflows-live-in-agents.md)).

Status: the publish run, which turns a pinned PDF into a minted Target KA.

## Depends on

`@verisci/core`, `@verisci/env`, `@verisci/dkg`, `@verisci/contracts`; Inngest, viem
(signature checks) and Zod.

## Environment

Declared in `src/agents-env.ts`, extending the DKG node's settings
([`packages/dkg`](../dkg/README.md#environment)), and validated on first import of
`@verisci/agents/env`, not of the main entry, which exports `createAgentsEnv` (it
validates only when called). The functions build their adapters on their first run, so
`web` serves them, and `next build` imports them, without any of these set. A deployed
server (`APP_ENV` other than `local`) checks them when it starts, through
`apps/web/instrumentation.ts`, and refuses to start on a bad one.

| Variable | Value |
| --- | --- |
| `GROBID_URL` | GROBID's base URL: `http://127.0.0.1:8070` locally ([`docs/node-host.md`](../../docs/node-host.md) → GROBID) |
| `PINATA_GATEWAY_URL` | The Pinata account's dedicated gateway, `https://<name>.mypinata.cloud` |
| `CHAIN_RPC_URL` | A Base Sepolia RPC URL, to check smart-contract wallets' signatures |

The `publish-pdf` dev script also reads `PINATA_JWT`, a Pinata API key allowed to upload
files. Inngest's own settings are read by its SDK: with `APP_ENV=local` the client talks to
the local dev server; deployed, it needs Inngest's event and signing keys.

## API

| Export | What it does |
| --- | --- |
| `agentsName` | The package name, listed on the web app's home page |
| `inngest` | verisci's Inngest client, in dev mode when `APP_ENV` is `local` |
| `functions` | Every Inngest function, for `web`'s `/api/inngest` route |
| `publishPaper` | The `publish-paper` function, run by `verisci/paper.submitted` |
| `PAPER_SUBMITTED` | The event's name, `verisci/paper.submitted` |
| `PUBLISH_SETTINGS` | The publish run's limits (below) |
| `PublishOutcome`, `PaperRefusal`, `SubmissionRefusal` | How a run ends: `minted` with its UAL, or `refused` with why |
| `env` (from `@verisci/agents/env`); `createAgentsEnv(runtimeEnv)`, `AgentsEnv` (from either entry) | The validated settings, the function that builds them from a given object, and their type |

## Publishing a paper

`verisci/paper.submitted` carries `{ cid, contextGraph, deadline, submitter, signature }`:
the PDF's CID (canonical CIDv1 base32), the context graph, a deadline in Unix seconds as a
decimal string, and the submitter's EIP-712 signature over the first three
([`packages/core`](../core/README.md#target-kas), [ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)).

The run is a singleton per CID in mode `skip`: a second event for a PDF being published
starts nothing. Its steps:

1. **verify**: the CID is canonical, the graph is this environment's, the deadline is ahead
   of the time Inngest received the event (by at most a day), and the submitter signed it. An EOA signature is checked locally; any other is asked of
   the chain, so smart-contract wallets verify too. A refused submission ends the run.
2. **read**: the Target KA's state. Minted ends the run with its UAL; stored goes to the
   mint; a draft (sealed, not shared) goes to the store, which only shares it. A KA already stored or minted keeps its first submitter.
3. **read-paper**: fetches the PDF through the gateway and has GROBID parse its header, in
   one step, so the PDF's bytes are never a step output. A file that is not a PDF, is over
   30 MB, that GROBID cannot parse (204, another 4xx, or an answer that is not TEI) or that
   has no readable title ends the run, refused. A DOI is kept only if it looks like one.
4. **store**, then **mint**: `startMint` listens 10 s, then the run polls the state every
   30 s with `step.sleep`. A mint not seen after 10 minutes is started again
   ([ADR 0008](../../docs/adr/0008-mints-are-async-polled-in-short-steps.md)).

Retries ([ADR 0009](../../docs/adr/0009-retries-are-spaced-with-step-sleep.md)):

- **verify:** a chain that does not answer (for a smart-wallet signature) waits 2 minutes
  and runs verify again, up to 5 times, then fails the run.
- **read, read-paper, store, mint:** a quorum failure, or a node, gateway or GROBID that
  does not answer, waits 2 minutes and starts a new attempt from the read; a mint not seen
  after 10 minutes starts a new attempt at once. Up to 5 attempts.
- The run has 45 minutes in all, which can end it before its 5 attempts.
- It fails at once when its settings are missing or invalid, when the node or GROBID refuses
  our credential, or when the node does not serve the graph. A run that fails is recovered by publishing the same
  PDF again.

## Running a publish locally

1. Start the RPC proxy, the DKG node and GROBID ([`docs/node-host.md`](../../docs/node-host.md)).
2. Fill the DKG and publish sections of the root `.env.local` ([`.env.example`](../../.env.example)).
3. `pnpm dev`, then, in another terminal, `pnpm --filter @verisci/web inngest` (the
   Inngest dev server, at http://localhost:8288).
4. `pnpm --filter @verisci/agents publish-pdf <file.pdf>` pins the PDF on Pinata's public
   network with CIDv1 import settings, signs it with a throwaway key and sends the event. A
   relative path is read from the directory you type the command in.
   The run's steps and result show in the dev server.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/agents typecheck` | Typechecks the package and its scripts |
| `pnpm --filter @verisci/agents test` | Runs its Vitest project (`vitest run`) with mocked adapters |
| `pnpm --filter @verisci/agents publish-pdf <file.pdf>` | Dev only: pins a PDF, signs it and sends `verisci/paper.submitted` to the local dev server |

Ships TypeScript source (`src/index.ts`, `src/env.ts`), with no build step.
