# @verisci/workflows

Inngest workflows that combine `core` logic with the `dkg` and `contracts` adapters;
`apps/web` only serves them ([ADR 0003](../../docs/adr/0003-inngest-functions-live-in-workflows.md)).

Status: the publish run, which turns a pinned PDF into a minted Target KA, and the calls
the upload page makes to start and follow it.

## Depends on

`@verisci/core`, `@verisci/env`, `@verisci/dkg`, `@verisci/contracts`; Inngest, viem
(signature checks) and Zod.

## Environment

Declared in `src/workflows-env.ts`, extending the DKG node's settings
([`packages/dkg`](../dkg/README.md#environment)), and validated on first import of
`@verisci/workflows/env`, not of the main entry, which exports `createWorkflowsEnv` (it
validates only when called). The functions build their adapters on their first run, so
`web` serves them, and `next build` imports them, without any of these set. A deployed
server (`APP_ENV` other than `local`) checks them when it starts, through
`apps/web/instrumentation.ts`, and refuses to start on a bad one.

| Variable | Value |
| --- | --- |
| `GROBID_URL` | GROBID's base URL: `http://127.0.0.1:8070` locally ([`docs/node-host.md`](../../docs/node-host.md) → GROBID) |
| `PINATA_GATEWAY_URL` | The Pinata account's dedicated gateway, `https://<name>.mypinata.cloud`; one account serves every environment ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)) |
| `CHAIN_RPC_URL` | A Base Sepolia RPC URL, to check smart-contract wallets' signatures |
| `PINATA_JWT` | A Pinata API key (JWT) allowed to upload, list and delete files; the `publish-pdf` dev script reads it too. Secret |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Inngest's keys, required unless `APP_ENV` is `local`: the SDK reads them itself, and the signing key also reads runs for the upload page. Secret |
| `VERCEL_GIT_COMMIT_REF` | Set by Vercel: on staging, the branch, which names the Inngest branch environment runs are read from |

With `APP_ENV=local` the Inngest client sends events to the local dev server and the
upload page reads runs there, with no keys.

## API

| Export | What it does |
| --- | --- |
| `workflowsName` | The package name, imported by the web app's package test |
| `inngest` | VeriSci's Inngest client, in dev mode when `APP_ENV` is `local` |
| `functions` | Every Inngest function, for `web`'s `/api/inngest` route |
| `publishPaper` | The `publish-paper` function, run by `verisci/paper.submitted` |
| `PAPER_SUBMITTED` | The event's name, `verisci/paper.submitted` |
| `PUBLISH_SETTINGS` | The publish run's limits (below) |
| `PublishOutcome`, `PaperRefusal`, `SubmissionRefusal` | How a run ends: `minted` with its UAL, or `refused` with why |
| `PublishFailure`, `publishFailureReason(output)` | Why a run stopped instead (`chain-unreachable`, `paper-unreachable`, `node-unreachable`, `mint-not-confirmed`, `setup`): each error it throws starts `publish-failed:<reason>:`, and the reader finds it in a failed run's output however Inngest nests it |
| `getUploadService()` | The upload page's calls, built on first use from the settings: `contextGraph`, `createUploadUrl()`, `submitPaper(input, limiter)`, `readPaper(cid, eventId?)` (below) |
| `UploadService`, `PaperStatus`, `PublishedRecord`, `UPLOAD_SETTINGS` | Their type, what `readPaper` returns (the Target KA's state and the run), and the upload URL's and signature's lifetimes |
| `SubmitResult`, `SubmitRefusal`, `SubmitLimiter` | What `submitPaper` returns, why it refuses, and the per-submitter limit the web app passes it |
| `UploadUrlResult`, `ReadRunResult`, `RunState` | What `createUploadUrl` and the run read return |
| `env` (from `@verisci/workflows/env`); `createWorkflowsEnv(runtimeEnv)`, `WorkflowsEnv` (from either entry) | The validated settings, the function that builds them from a given object, and their type |

## Publishing a paper

`verisci/paper.submitted` carries `{ cid, contextGraph, deadline, submitter, signature }`:
the PDF's CID (canonical CIDv1 base32), the context graph, a deadline in Unix seconds as a
decimal string, and the submitter's EIP-712 signature over the first three
([`packages/core`](../core/README.md#target-kas), [ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)).

The run is a singleton per CID in mode `skip`: a second event for a PDF being published
starts nothing. Its steps:

1. **verify**: the CID is canonical, the graph is this environment's, the deadline is ahead
   of the time Inngest received the event (by at most a day), and the submitter signed it.
   An EOA signature is checked locally; any other is asked of the chain, so smart-contract
   wallets verify too. A refused submission ends the run.
2. **read**: the Target KA's state. Minted ends the run with its UAL; stored goes to the
   mint; a draft (sealed, not shared) goes to the store, which only shares it. A KA already
   stored or minted keeps its first submitter.
3. **read-paper**: fetches the PDF through the gateway and has GROBID parse its header, in
   one step, so the PDF's bytes are never a step output. A file that is not a PDF, is over
   30 MB, that GROBID cannot parse (204, a 4xx other than 401, 403, 408 and 429, or an
   answer that is not well-formed TEI) or that has no readable title ends the run, refused.
   GROBID's 401 and 403 fail the run; 408 and 429 are retried. A DOI is kept only if it
   looks like one.
4. **store**, then **mint**: `startMint` listens 10 s, then the run polls the state every
   30 s with `step.sleep`. A mint not seen after 10 minutes is started again
   ([ADR 0008](../../docs/adr/0008-mints-are-async-polled-in-short-steps.md)).

Retries ([ADR 0009](../../docs/adr/0009-retries-are-spaced-with-step-sleep.md)):

- **verify:** a chain that does not answer (for a smart-wallet signature) waits 2 minutes
  and runs verify again, up to 5 times, then fails the run.
- **read, read-paper, store, mint:** a quorum failure, a node, gateway or GROBID that
  does not answer, or a draft gone before the store (`no-content`) waits 2 minutes and
  starts a new attempt from the read, which reads the paper again only when nothing is
  stored ([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)); a mint not seen
  after 10 minutes starts a new attempt at once. Up to 5 attempts.
- The run has 45 minutes in all, which can end it before its 5 attempts.
- It fails at once when its settings are missing or invalid, when the node or GROBID refuses
  our credential, or when the node does not serve the graph. A run that fails is recovered
  by publishing the same PDF again.

## The upload page's calls

`getUploadService()` serves `apps/web`'s upload page ([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)):

- **`createUploadUrl()`** signs a Pinata upload URL, valid 5 minutes, for one file of at most
  30 MB detected as `application/pdf`, pinned with `cid_version` `v1` like `publish-pdf`, so
  one PDF keeps one CID (`docs/domain.md` → IPFS).
- **`submitPaper(input, limiter)`** checks a signed `{ cid, contextGraph, deadline,
  submitter, signature }` as the run does. A PDF whose Target KA is already minted starts
  nothing and counts nothing: the result gives its UAL instead of an event id. Otherwise it
  checks the submitter's limit (`rate-limited`), then the file pinned under that CID on
  Pinata's public network (`not-pinned` when there is none). A file over 30 MB or not a PDF
  is refused (`too-large`, `not-a-pdf`), and unpinned only when its Target KA is known
  missing (Pinata keeps one file per CID). It then sends `verisci/paper.submitted` with no
  time of its own, so Inngest stamps it, under the id `paper:<cid>:<submitter>:<deadline>`:
  Inngest drops a repeat of one signed submission for 24 hours. A new signature starts a run
  unless one for that CID is active (the singleton), and the paper's page then follows the
  paper on the node. It returns Inngest's event id. Only a sent submission is counted. A
  chain, Pinata, limit store or Inngest that does not answer gives `unavailable`; a node that
  does not answer leaves the already-minted check to the run.
- **`readPaper(cid, eventId?)`** reads the Target KA's state on the node and, given the
  event id, the run Inngest started for it (REST, from the dev server locally). Once the KA
  is minted, it also reads the record back (SPARQL through the node: title, authors, DOI,
  PDF link, submitter, signature, deadline), checks the signature against the submitter as
  the run does, without the deadline rule, and gives the agent address the asset is minted
  to (`publisher`: the UAL's author, our node). A failed run's status carries `failure`,
  the reason its error names; a minted paper whose record cannot be shown carries
  `recordProblem`: `unavailable` when the node did not answer the query, asked to retry, or
  answered 429 or a server error; `unreadable` when it refused the query or no record parses
  ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)). Locally, a run's
  output comes from the dev server's GraphQL API, since its REST read answers it empty.

## Running a publish locally

1. Start the RPC proxy, the DKG node and GROBID ([`docs/node-host.md`](../../docs/node-host.md)).
2. Fill the DKG and publish sections of the root `.env.local` ([`.env.example`](../../.env.example)).
3. `pnpm dev`, then, in another terminal, `pnpm --filter @verisci/web inngest` (the
   Inngest dev server, at http://localhost:8288).
4. `pnpm --filter @verisci/workflows publish-pdf <file.pdf>` pins the PDF on Pinata's public
   network with CIDv1 import settings, signs it with a throwaway key and sends the event. A
   relative path is read from the directory you type the command in.
   The run's steps and result show in the dev server.
5. Or publish through the page: open http://localhost:3000/publish with `REOWN_PROJECT_ID`
   set ([`apps/web`](../../apps/web/README.md#environment)).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/workflows typecheck` | Typechecks the package and its scripts |
| `pnpm --filter @verisci/workflows test` | Runs its Vitest project (`vitest run`) with mocked adapters |
| `pnpm --filter @verisci/workflows publish-pdf <file.pdf>` | Dev only: pins a PDF, signs it and sends `verisci/paper.submitted` to the local dev server |

Ships TypeScript source (`src/index.ts`, `src/env.ts`), with no build step.
