# @labstrail/workflows

Inngest workflows that combine `core` logic with the `dkg` and `contracts` adapters;
`apps/web` only serves them ([ADR 0003](../../docs/adr/0003-inngest-functions-live-in-workflows.md)).

Status: the publish run, which turns a pinned PDF into a minted Target KA, the calls the
upload page makes to start and follow it, and the papers list's read; the rating run, which
scores a requested paper and has the oracle record it, and the oracle function; and the
rating pages' calls, which read a paper's ratings and one rating's progress. Deployed, the
Alchemy Notify webhook starts the rating run and the reconciler restarts a request whose run
stopped; locally, the paper page or a dev script starts it. Every publish, every settled
rating and anything needing the maintainer goes to one Telegram chat.

Architecture views: [`.omm/overall-architecture/workflows/`](../../.omm/overall-architecture/workflows/), [`.omm/pipeline/`](../../.omm/pipeline/) (`pnpm exec omm view --port 4000` shows them; root README → Architecture).

## Depends on

`@labstrail/core`, `@labstrail/env`, `@labstrail/dkg`, `@labstrail/contracts`; Inngest, viem
(signature checks, the rating contract, the oracle's transactions), Zod and unpdf (a PDF's
text, for the scorer and the field check). The scorer and the field check, which both the
publish and the rating runs make, call the Gemini API over `fetch` (`src/gemini/`), with no SDK.

## Environment

Declared in `src/workflows-env.ts`, extending the DKG node's settings
([`packages/dkg`](../dkg/README.md#environment)), and validated on first import of
`@labstrail/workflows/env`, not of the main entry, which exports `createWorkflowsEnv` (it
validates only when called). The functions build their adapters on their first run, so
`web` serves them, and `next build` imports them, without any of these set. A deployed
server (`APP_ENV` other than `local`) checks them when it starts, through
`apps/web/instrumentation.ts`, and refuses to start on a bad one.

| Variable | Value |
| --- | --- |
| `GROBID_URL` | GROBID's base URL: `https://verisci-grobid.duckdns.org`, on the node server, which takes the environment's `DKG_TOKEN` as its credential ([ADR 0039](../../docs/adr/0039-one-credential-per-environment.md)); or `http://127.0.0.1:8070` for a GROBID run locally in Docker ([`docs/node-host.md`](../../docs/node-host.md) → The developer's computer) |
| `PINATA_GATEWAY_URL` | The Pinata account's dedicated gateway, `https://<name>.mypinata.cloud`, through which the publish and rating runs read PDFs; one account serves every environment ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)) |
| `CHAIN_RPC_URL` | A Base Sepolia RPC URL, to check smart-contract wallets' signatures and, on staging and production, for the rating functions to read and write the rating contracts and the pages to read their ratings. Deployed, the Alchemy RPC URL: Base's public endpoint refused the pages' bursts (`docs/domain.md` → Chain) |
| `PINATA_JWT` | A Pinata API key (JWT) allowed to upload, list and delete files; the `publish-pdf` dev script reads it too. Secret |
| `GEMINI_API_KEY` | A Gemini API key from Google AI Studio, for the field check both runs make ([ADR 0037](../../docs/adr/0037-labstrail-rates-life-science-and-health-papers.md)) and the rating functions' scorer ([ADR 0018](../../docs/adr/0018-phase-1-scorer-output-contract.md)); the `score-papers` dev script reads it too. Every deployment checks it at start, previews included. Secret |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Inngest's keys, required unless `APP_ENV` is `local`: the SDK reads them itself, and the signing key also reads runs for the upload page. Secret |
| `VERCEL_GIT_COMMIT_REF` | Set by Vercel: on staging, the branch, which names the Inngest branch environment runs are read from |
| `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL` | Set by Vercel: production's domain and the branch's URL, which notifications link to (`siteUrlOf`); locally, `http://localhost:3000` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | The bot's token (`<bot id>:<secret>`, from @BotFather) and the numeric id of the chat notifications go to, one for every environment ([ADR 0038](../../docs/adr/0038-alerts-go-to-one-telegram-chat.md)). Required on production, which refuses to start without them; optional elsewhere, where unset, as locally, notifications are only logged. On Vercel, set them on Production and on `develop` only (scoped to that branch, like the oracle key), so a feature preview, whose messages would also read `staging`, only logs. The notifier reads only these and the shared settings, as optional, so an alert still goes out (or is logged) when another setting is bad. The token is secret |
| `ALCHEMY_WEBHOOK_SIGNING_KEY` | Optional: the signing key of this environment's Alchemy Notify webhook (`webhookKeySchema`), read by `getWebhookIntake` and checked at start with the settings above; without it the webhook route answers 404, as on feature previews. Locally, any value lets `post-webhook` check the route. Secret |

The rating functions read four more, declared in `src/rating-env.ts`
(`createRatingEnv`) and validated with the settings above in one pass, so one `EnvError`
names every bad variable. A deployment serves the rating and oracle functions only when
`ORACLE_PRIVATE_KEY` is set (`servesRating`); a deployed server checks these at start in
production, which refuses to start without the key, and on staging when the key is set
([ADR 0019](../../docs/adr/0019-oracle-transactions-are-serialized.md)).

| Variable | Value |
| --- | --- |
| `ORACLE_PRIVATE_KEY` | The oracle's key, `0x` and 64 hex: on Vercel only `develop` (staging's, scoped to that branch) and production hold one; locally, Anvil's second default account's key. Secret |
| `PUBLISHER_ADDRESSES` | The DKG node's publisher wallets, comma-separated ([`docs/node-host.md`](../../docs/node-host.md) lists them), whose ETH and TRAC the health check watches. Required outside `local`, so a deployment that would watch none refuses to start ([ADR 0015](../../docs/adr/0015-rating-requests-are-free-on-testnet.md)); optional locally |
| `LOCAL_CHAIN_RPC_URL`, `LOCAL_RATING_CONTRACT` | Required only when `APP_ENV=local`: Anvil's URL (`http://127.0.0.1:8546`) and the RatingController deployed there ([ADR 0036](../../docs/adr/0036-local-rating-runs-use-anvil.md)). The pages' rating calls (`getRatingService`), the `rate-paper`, `fund-local` and `post-webhook` scripts read them too (`post-webhook` only the URL), and the webhook's intake reads the contract, locally only (`webhookSchema`). Elsewhere the contracts come from the committed deployments file, current and past ([ADR 0028](../../docs/adr/0028-deployed-addresses-are-committed.md)) |

`DKG_CONTEXT_GRAPH` must spell its address in EIP-55 checksum case, as the node lists it
(`@labstrail/dkg`'s rule): a query with the address in another case reads another, empty
graph, so the papers list would show none (`docs/domain.md` → DKG).

With `APP_ENV=local` the Inngest client sends events to the local dev server and the
upload page reads runs there, with no keys.

## API

| Export | What it does |
| --- | --- |
| `workflowsName` | The package name, imported by the web app's package test |
| `inngest` | LabsTrail's Inngest client, in dev mode when `APP_ENV` is `local` |
| `functions`, `servedFunctions(runtimeEnv)` | The Inngest functions this deployment serves, for `web`'s `/api/inngest` route: the publish function and the failure alerts, plus the rating, oracle, reconciler and health functions when `ORACLE_PRIVATE_KEY` is set |
| `reconcileRatings`, `failureAlerts`, `healthCheck` | The `reconcile-ratings` cron, the `alert-on-failure` function and the `check-health` cron (below) |
| `publishPaper` | The `publish-paper` function, run by `labstrail/paper.submitted` |
| `ratePaper`, `oracleTransaction` | The `rate-paper` function, run by `labstrail/rating.requested`, and the `oracle-transaction` function it invokes (below) |
| `RATING_REQUESTED`, `RatingRequested`, `ratingRequestedEvent(log)` | The rating event's name, `labstrail/rating.requested`, its data `{ contract, requestId }`, and the event for a `Phase1Requested` log (id `rating:<request id>`), or `undefined` for any other log |
| `RATING_SETTINGS`, `ORACLE_SETTINGS` | The rating run's and the oracle function's limits (below) |
| `RatingOutcome`, `RatingFailure`, `ratingFailureReason(output)` | How a rating run ends (`fulfilled`, `cancelled` with an optional orphan R-KA, `skipped`, with an orphan R-KA when the oracle found the request gone, or the R-KA an oracle move may leave unrecorded), and why one stopped instead: each error it throws starts `rating-failed:<reason>:` |
| `OracleAction`, `OracleInput`, `OracleResult`, `OracleFailure` | What the oracle function is asked, what it answers, and why it stops (`oracle-failed:<reason>:`) |
| `createRatingEnv(runtimeEnv)`, `RatingEnv`, `checkRatingSettings(runtimeEnv)`, `ratingSettingsRequired(runtimeEnv)`, `servesRating(runtimeEnv)` | The rating settings and their type, the start check `apps/web/instrumentation.ts` runs, when it requires them, and whether a deployment serves the rating functions |
| `PAPER_SUBMITTED` | The event's name, `labstrail/paper.submitted` |
| `PUBLISH_SETTINGS` | The publish run's limits (below) |
| `PublishOutcome`, `PaperRefusal`, `SubmissionRefusal` | How a run ends: `minted` with its UAL, or `refused` with why |
| `PublishFailure`, `publishFailureReason(output)` | Why a run stopped instead (`chain-unreachable`, `paper-unreachable`, `node-unreachable`, `network-refused`, `mint-not-confirmed`, `setup`): each error it throws starts `publish-failed:<reason>:`, and the reader finds it in a failed run's output however Inngest nests it |
| `siteUrlOf(env)`, `SiteEnv` | The site's address: production's domain, the branch's URL on staging, `http://localhost:3000` locally; notifications link to it, and the web app's metadata, sitemap and structured data use it |
| `getUploadService()` | The pages' calls, built on first use from the settings: `contextGraph`, `createUploadUrl()`, `submitPaper(input, limiter)`, `readPaper(cid, eventId?)`, `listPapers({ page, pageSize })` (below) |
| `UploadService`, `PaperStatus`, `PublishedRecord`, `UPLOAD_SETTINGS` | Their type, what `readPaper` returns (the Target KA's state and the run), and the upload URL's and signature's lifetimes |
| `SubmitResult`, `SubmitRefusal`, `SubmitLimiter`, `LimitAnswer` | What `submitPaper` returns, why it refuses, the per-submitter limit the web app passes it, and the limit's answer (`unavailable` carries what the store threw) |
| `UploadUrlResult`, `PinataUnavailable`, `ReadRunResult`, `RunState` | What `createUploadUrl` and the run read return; Pinata's `unavailable` carries what came back (`HTTP 503`, `unexpected answer`, or the error) |
| `describeFailure(error)`, `PublishLogger` | A thrown value as one short log line, with its HTTP status and up to three causes (a refused connection names its address and port), and with URLs, bearer tokens, JWTs and long hex removed; the logger a run or a submission warns through |
| `getRatingService()` | The rating pages' calls, built on first use from the settings: `listRatings(targetUal)`, `paperRatingSummaries(targetUals)`, `readRating(requestId)`, `announceLocalRating(txHash)` (below) |
| `RatingService`, `RatingSummary`, `RatingListResult`, `RatingView`, `RatingStage`, `AnnounceResult` | Their type and answers: one request as its contract holds it; a paper's requests, oldest first, or `unavailable`; one rating, with its stage on the node while pending or its R-KA's record once fulfilled; the local announce's result |
| `PaperRatingSummary`, `summariseRatings(ratings)` | A paper's rating as the pages show it (`scored` with the latest score, `pending`, `cannot-rate`, `unrated`, or `unknown` when the chain did not answer), and the one rule, shared by the papers list and the paper page, that sums a paper's requests into it |
| `getWebhookIntake()`, `WebhookIntake`, `WebhookStatus` | The Alchemy Notify webhook's intake for `apps/web`'s route, built on first use: `receive(rawBody, signature)` answers the status to send back (below) |
| `PaperListResult`, `PaperSummary`, `SignatureCheck`, `QueryProblem` | What `listPapers` returns: a page of papers with the total, or why not (`unavailable`, `unreadable`); one listed paper; a signature check (`valid`, `invalid`, `unknown`) |
| `env` (from `@labstrail/workflows/env`); `createWorkflowsEnv(runtimeEnv)`, `WorkflowsEnv` (from either entry) | The validated settings, the function that builds them from a given object, and their type |

## Publishing a paper

`labstrail/paper.submitted` carries `{ cid, contextGraph, deadline, submitter, signature }`:
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
3. **parse-paper**: fetches the PDF through the gateway, has GROBID parse its header and
   reads the start of its text (`openingChars`, 6,000 characters) with the rating's reader,
   in one step, so the PDF's bytes are never a step output. A file that is not a PDF, is over
   15 MB, that GROBID cannot parse (204, a 4xx other than 401, 403, 408 and 429, or an
   answer that is not well-formed TEI), that has no readable title, that the rating's reader
   cannot parse (`unreadable`) or that has no text layer (`no-text`) ends the run, refused,
   so every published paper can be rated. GROBID's 401 and 403 fail the run; 408 and 429 are
   retried. A DOI is kept only if it looks like one. The title is GROBID's, completed from the
   title the PDF stores in its own metadata (its info dictionary's `Title`, else its XMP
   `dc:title` when that holds one version) when GROBID dropped its first words: core's
   `completeTitle` takes the stored one only when it ends with GROBID's, after words that are
   not a journal's name (`packages/core` → Target KAs).
4. **check-field**: asks `gemini-3.5-flash-lite` (`fieldModel`, free tier) whether the paper
   is in LabsTrail's field, from its title, abstract and opening (`checkField`, with core's
   `fieldCheckPrompt`; [ADR 0037](../../docs/adr/0037-labstrail-rates-life-science-and-health-papers.md)).
   A paper `outside` ends the run `refused: outside-field` before anything is stored, and the
   run logs Gemini's reason with the CID. A check that gets no answer (a rate limit, an outage,
   an answer that does not parse) waits 30 s (`fieldRetryWait`, `check-field-wait-<n>`) and
   asks once more (`check-field-<n>-again`); when that fails too, the paper is published, its
   rating checking the field again, and the run logs `field-unchecked` with the failure and
   its HTTP status. Gemini refusing the request (a bad key, a model it no longer serves) is a
   setup error: the run fails (`setup`) with nothing stored. The verdict is asked once per
   run, on the first attempt whose paper is read: a later attempt reads the paper again but
   asks nothing, and a draft or a minted asset is never checked. Gemini gets 60 s (`fieldTimeoutMs`). The check reads untrusted text: a paper
   written to fool it is published, and its rating still checks the field.
5. **store**, then **mint**: `startMint` listens 10 s, then the run polls the state every
   30 s with `step.sleep`. A mint not seen after 10 minutes is started again
   ([ADR 0008](../../docs/adr/0008-mints-are-async-polled-in-short-steps.md)).
6. **notify**: a paper this run minted, not one an earlier run did, is announced once, by the
   title it read, or its CID, with a link to its page (Notifications and alerts, below).

Retries ([ADR 0009](../../docs/adr/0009-retries-are-spaced-with-step-sleep.md)):

- **verify:** a chain that does not answer (for a smart-wallet signature) waits 2 minutes
  and runs verify again, up to 5 times, then fails the run.
- **read, parse-paper, store, mint:** a quorum failure, a node, gateway or GROBID that
  does not answer, or a draft gone before the store (`no-content`) waits 2 minutes and
  starts a new attempt from the read, which reads the paper again only when nothing is
  stored ([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)); a mint not seen
  after 10 minutes starts a new attempt at once. Up to 5 attempts; the run then fails with
  the last attempt's reason: `network-refused` for a quorum failure (the network's cores
  declining the mint, as for a graph waiting for their activation, `docs/domain.md` →
  DKG), `node-unreachable` for the node, `paper-unreachable` for the gateway or GROBID,
  `mint-not-confirmed` for a mint not seen.
- **check-field:** one more ask after 30 s, not 2 minutes: free-tier Gemini calls that
  failed within seconds answered 30 s later (`docs/domain.md` → Gemini), and a paper is
  published anyway when the second ask fails, so a longer wait would only hold it back.
- The run has 45 minutes in all, which can end it before its 5 attempts.
- It fails at once when its settings are missing or invalid, when the node or GROBID refuses
  our credential or Gemini the field check's request, or when the node does not serve the
  graph. A run that fails is recovered
  by publishing the same PDF again.

## Rating a paper

`labstrail/rating.requested` carries `{ contract, requestId }`: a RatingController's lowercase
address and a phase-1 request id. The `rate-paper` run is a singleton per request id in mode
`skip` ([ADR 0020](../../docs/adr/0020-stuck-requests-recovered-only-oracle-cancels.md)),
has 300 minutes, enough for every attempt, their waits and the oracle, and outside `APP_ENV=local` is
throttled to 3 starts an hour with a burst of 3, against Inngest's free plan
([ADR 0015](../../docs/adr/0015-rating-requests-are-free-on-testnet.md)). It does only what
is left ([ADR 0007](../../docs/adr/0007-all-writes-converge.md)):

1. **Which requests:** the contract must be one of the environment's, current or past
   ([ADR 0023](../../docs/adr/0023-a-fix-is-a-redeploy-owner-powers-fixed.md)), or locally
   `LOCAL_RATING_CONTRACT`. **read-request** reads the request and the contract's oracle; a
   request no longer pending, or a contract whose oracle is not this deployment's key, ends
   the run before anything is spent.
2. **The target:** only papers LabsTrail published are rated
   ([ADR 0011](../../docs/adr/0011-a-rating-is-a-separate-r-ka.md)). A UAL that does not
   parse, is not canonical
   ([ADR 0031](../../docs/adr/0031-uals-are-normalized-before-the-contract.md)), names another
   chain than Base Sepolia, or names another publisher is cancelled `invalid-target` at once.
   Then **find-target** asks the node whether the target is one of its published papers
   (`publishedPaperQuery`), and cancels `invalid-target` when the node answers that it is not
   (a wrong number, or an R-KA), whatever the request's age. The node answers a query on a
   graph it does not hold with no rows (`docs/domain.md` → DKG), so an empty answer counts
   only after **check-graph** confirms the node serves the graph; otherwise the run fails `setup` and cancels nothing. A
   node that does not answer is asked again every 2 minutes, up to 5 times, then the run
   fails `node-unreachable`.
3. **read-rka:** the R-KA `verisci-rka-<request id>`. Minted goes to the read-back. Stored is
   minted at once, with no wait for a mint an earlier run may have started
   ([ADR 0008](../../docs/adr/0008-mints-are-async-polled-in-short-steps.md)). A draft is
   shared, then minted. Missing is scored, then **store** writes the R-KA
   (`packages/core` → Ratings):
   - **find-pdf** reads the `ipfs://` link to the paper's PDF from its own asset graph, with
     its title and abstract (`paperPdfQuery`, `paperHeadOf`). A link that is not an `ipfs://`
     CID cancels `invalid-target`. No link is retried: **find-target** found the paper in this
     graph, so the node is still loading it.
   - **read-paper** fetches the PDF through the gateway and extracts its text with unpdf
     (`packages/core` → Ratings → The paper's text), up to 150,000 characters. A PDF with no
     text layer (a scan), or one over the size limit (published before the limit was
     lowered from 30 to 15 MB), cancels `invalid-target`
     ([ADR 0011](../../docs/adr/0011-a-rating-is-a-separate-r-ka.md)). A gateway that does not
     give the file the first time in a run is asked once more 15 s later
     (`read-paper-<n>-wait`, then `read-paper-<n>-again`): it failed the first read of every run in local tests and gave
     the next. A failed read names its cause (`HTTP <status>`, a timeout, the network error).
     A file that is not a PDF or does not parse is read again on the next attempt, since the
     gateway may have given another file; after 4 such reads, at least 22 minutes apart in
     all, it cancels `invalid-target`.
   - **check-field** asks `gemini-3.5-flash-lite` whether the paper is in the field, as the
     publish run does (`checkField`, from its title, abstract and first 6,000 characters), once
     a run: a paper `outside` cancels `invalid-target` before Flash is asked, even while Flash is
     down; a check that does not answer leaves the field to the scorer
     ([ADR 0037](../../docs/adr/0037-labstrail-rates-life-science-and-health-papers.md)).
   - **score-paper** asks Gemini, in one request, for the paper's field and study type and the
     answer to each of that type's checks, with quotes; `scoreChecks` checks the quotes and
     computes the score. A paper outside the life sciences and health cancels
     `invalid-target`, and so do two answers the check refuses: the same paper and prompt
     tend to give the same answer, and each answer uses one of the free tier's 20 requests a
     day, which a restart would spend again.

   Each of these is done once per run: a later attempt starts from the first one missing.
4. **mint**, then **poll** every 30 s; a mint not seen after 10 minutes is started again.
5. **read-score** reads the score back from the minted R-KA, and the oracle function fulfils
   with it, so the score on chain equals the R-KA's
   ([ADR 0018](../../docs/adr/0018-phase-1-scorer-output-contract.md)).

Past the maximum age (24 hours after the request's block), a minted R-KA is still fulfilled;
a stored one is polled for 10 minutes without a new mint, and is fulfilled if it lands;
anything else is cancelled `expired`. A stored R-KA left behind, or one minted for a request
cancelled meanwhile or gone when the oracle reads it (a reorg after the run's read), is an
orphan: the outcome names it, and the run logs it and alerts on it from an **alert-orphan**
step. When the contract's oracle changed mid-run, the run logs and alerts
(**alert-oracle-moved**) what becomes of its R-KA. A minted one is recorded by a later run once the deployment holds the contract's oracle key again, the role pointed back
([ADR 0020](../../docs/adr/0020-stuck-requests-recovered-only-oracle-cancels.md)) or a rotated
key deployed ([ADR 0019](../../docs/adr/0019-oracle-transactions-are-serialized.md)), unless
the request is cancelled by hand meanwhile. A stored one, past the maximum age, is recorded only
if its mint landed; a later run otherwise cancels the request `expired`, leaving it unrecorded.
Once the oracle settles the request, a **notify** step
sends one activity message: the score or why it was cancelled, the paper (by its title, or its
UAL when it has none), and the rating's page. A run that never read the paper, a restart that
found the R-KA minted, looks it up first (**find-paper**); without the node's answer, the
message names the paper by its UAL, with no link.

Retries ([ADR 0009](../../docs/adr/0009-retries-are-spaced-with-step-sleep.md)): a chain
that does not answer is read again every 2 minutes, up to 5 times, and so is a node that does
not answer whether it published the target (`lookupAttempts`, `lookupWait`). A node that does
not answer or gives no rows yet, a quorum failure, a gateway that does not give the PDF, a
file that does not read as a PDF (fewer than 4 times), or a Gemini call that is unreachable
or rate-limited starts a new attempt from the R-KA's read after a growing wait: 2, 5, 15, 30,
then 60 minutes (`retryWaits`), so 6 attempts ride out about 2 hours of a Gemini outage. Then
the run fails (`node-unreachable`, `paper-unreachable`, `paper-unreadable`,
`scorer-unavailable`; `mint-not-confirmed` when the mint is never seen). A Gemini answer the
check refuses is asked for again once. A node that does not answer is never taken for a
missing paper. It fails at once (`setup`) on missing or invalid settings, a node that
refuses our key, Gemini refusing the request (the detail names its status), or a node that
does not serve the graph, and
(`rating-unreadable`) on a minted R-KA whose score does not parse. A failed run leaves the
request pending and alerts the maintainer; the reconciler restarts it (below).

The scorer asks `gemini-3.8-flash` once per attempt until it gets an answer, at most 6 times
a run, and each restart asks again, against the free tier's 20 a day (`docs/domain.md` →
Gemini; [ADR 0018](../../docs/adr/0018-phase-1-scorer-output-contract.md)): `scorePaper` sends `scorerPrompt`, temperature 0 and
`SCORER_OUTPUT_SCHEMA`, checks the answer with `parseScorerAnswer` (`askScorer`), then scores
a paper in the field with `scoreChecks`. A 429 is `rate-limited`; any other 4xx is
`refused`; a 5xx, a network error or no answer within 240 s is `unreachable`; each failure
Gemini answered carries its HTTP status (a bad key is 400, a key without access 401 or 403, a
model Gemini no longer serves 404). No candidate, a blocked or unfinished answer, or text
the check refuses (`parseScorerAnswer`: a check of the study type left unanswered, say) is
`invalid-output`; a quote, reason or rationale over its limit is cut, not refused. No failure
carries the key.

### Measuring the scorer

`scripts/reference-papers.json` holds 14 open-access papers: 12 in the life sciences and
health, covering every study type, some well reported and some poorly, and 2 outside the
field. For each in-field paper it records the answer a careful reader gives to each check,
and a score range 10 points either side of the score those answers give; a test keeps it
consistent with the checklists. The expectations were written before the scorer first read
the papers, and change only on purpose.

`pnpm --filter @labstrail/workflows score-papers [id…]` scores them as a rating run would:
the PDF's text, then one request to Gemini, asked again as a rating run would. It prints,
for each paper, the study type found, the score against its range and, when the type is the
expected one, each check answered otherwise than expected, with why an answer lost its point:
its quote is not in the paper, it has none, or it says a check that always applies does not.
Run it whenever a prompt, a checklist or the model changes, and keep the change only if the
results improve. It needs `GEMINI_API_KEY` and `APP_ENV=local`, downloads each PDF once into
`node_modules/.cache/labstrail-reference/` (a file that is not a PDF, such as a publisher's
robot check, is not kept: save the PDF there by hand), and writes the run's answers there
after each paper. It never publishes, stores or rates anything.

`score-papers --field [id…]` runs only the publish run's field check instead: it reads each
cached PDF as the publish run does (GROBID's header and the start of the text, so it also
needs `GROBID_URL`, and `DKG_TOKEN` for the node server's GROBID), asks `checkField`, and
prints the expected and the found field with Gemini's reason. Each paper costs one
Flash-Lite request, which has its own daily limit.

A scoring run costs one `gemini-3.8-flash` request per paper, and the free tier allows 20 of
those a day per Google project (`docs/domain.md` → Gemini): a full run uses 14 of them. To try a change within a day, run
only the papers it should fix (`score-papers <id> <id>`), then the whole set once more before
keeping it. Google's terms forbid getting around the limit, so more keys or projects are not
an option; a paid tier is.

## The oracle function

`oracle-transaction` sends every fulfil and cancel the backend sends
([ADR 0019](../../docs/adr/0019-oracle-transactions-are-serialized.md)). Rating runs invoke it
with `step.invoke`; no event starts it. It runs one step at a time (concurrency 1) and has 30
minutes.

- **send:** reads the account's latest and pending nonces. A pending nonce above the latest
  is a transaction in flight: it sends nothing and checks again every 15 s. Otherwise it reads
  the request and the contract's oracle and decides: a request already settled sends nothing
  (fulfilled with the same R-KA, or cancelled, is an answer; fulfilled with another R-KA fails
  `oracle-conflict`). Then it sends at the latest nonce, with the chain's fee estimate capped
  at 10 gwei.
- **receipt:** every 5 s, in steps of its own, reading the receipt of every transaction sent
  for the call at once. A successful receipt settles it. A reverted one,
  or a nonce another transaction took, reads the request again. Unmined after 60 s, the same
  call goes out at the same nonce with both fees raised by 15%; a raise past the cap is not
  sent, and is logged once as `oracle-at-fee-cap`.
- A send refused as nonce too low, already known or underpriced counts as a transaction in
  flight. One that holds the nonce for 10 minutes is replaced by a zero-value transfer to the
  oracle's own address, priced one raise above the cap. An oracle that cannot pay its gas is
  logged as `oracle-no-funds`.
- Nothing settled within 25 minutes fails `oracle-stuck`. Inngest's concurrency counts
  executing steps, not sleeping runs, so the pending-nonce check, not the limit, keeps one
  transaction in flight at a time.

Its answer is `fulfilled` (with the score and R-KA the chain holds), `cancelled` (with the
chain's reason), `not-our-oracle`, or `unknown` (the contract no longer knows the request).
An oracle without funds and a transaction at the fee cap are logged and alerted on once a
run, each from a step of its own (`alert-no-funds`, `alert-fee-cap`), so a replay never sends
it again; an `oracle-conflict` fails the run, which the failure alert reports.

## The Alchemy Notify webhook

Deployed, the rating run starts from the Alchemy Notify webhook
([ADR 0017](../../docs/adr/0017-chain-events-are-ingested-at-least-once.md)): `apps/web`'s
`POST /api/webhooks/alchemy` hands the raw body and its `X-Alchemy-Signature` to
`getWebhookIntake().receive`, which:

- answers 404 and reads nothing without `ALCHEMY_WEBHOOK_SIGNING_KEY`;
- checks the signature, a hex HMAC-SHA256 of the raw body under the key, in constant time
  before parsing, and answers 401 when it is missing or wrong;
- answers 400, logged `webhook-unreadable: <field>`, for a body that is not a Custom Webhook
  (GraphQL) delivery;
- sends one `labstrail/rating.requested` event per `Phase1Requested` log of an environment
  contract, built with `ratingRequestedEvent` (id `rating:<request id>`, so a repeated delivery
  makes no second run); a log marked `removed`, of another contract or of another event sends
  nothing. After a reorg, Alchemy Notify delivers the new block; the run's read of the request
  on chain stops one the reorg dropped before the run started, and the oracle function's read
  one dropped later, whose R-KA minted meanwhile is an orphan, alerted on (`docs/domain.md` →
  Chain, [ADR 0017](../../docs/adr/0017-chain-events-are-ingested-at-least-once.md));
- answers 503, logged `webhook-unavailable: inngest: …`, when Inngest refuses the events, so
  the Alchemy Notify webhook delivers again; otherwise 200.

Each environment registers one Custom Webhook on Base Sepolia, on its current contract (past
ones are paused), pointing at its deployment's route (staging's with the
`x-vercel-protection-bypass` query parameter). Its query takes every event of the contract,
of which the intake keeps the requests, and asks for the three fields the intake reads:

```graphql
{
  block {
    logs(filter: { addresses: ["<current contract>"], topics: [] }) {
      data
      topics
      account { address }
    }
  }
}
```

- Set `skip_empty_messages` on the webhook (the API's
  `graphql_query: { query, skip_empty_messages: true }`): without it, Alchemy Notify delivers
  every block, every 2 seconds, whether a log matched or not.
- Keep the contract's address in the filter: an empty address list takes every contract's
  events on Base Sepolia.
- Keep exactly one rule per contract (`docs/domain.md` → Chain).

## The reconciler

`reconcile-ratings`, an Inngest cron every 30 minutes and a singleton, finds requests whose
run stopped or never started, and sends each its rating event again
([ADR 0020](../../docs/adr/0020-stuck-requests-recovered-only-oracle-cancels.md)). It only
restarts runs: the run decides what is left (retry, cancel `invalid-target`, fulfil, or past
24 hours cancel `expired`), and the reconciler never writes.

- Each tick reads every contract of the environment (current and past, or Anvil's locally)
  in a step of its own (`find-stale-<contract>`), one after the other: one page of 100 ids of
  the pending set (`readPendingRequestIds`), page `tick mod pages`, so successive ticks reach
  every request without a stored cursor, then each request, 10 at a time (`readPending`), so
  the tick never has more than 10 calls at the RPC at once. A step ends within Vercel's 300 s
  even when every call waits out the RPC's 10 s timeout. One pending more than 4 hours gets
  its event, with the id
  `rating:<request id>:<window>`, the 4-hour window of the tick: every tick of a window sends
  the same id, so Inngest starts at most one run per request per window whatever the
  throttle does, and the singleton keeps it off a run still going.
- 4 hours: a run waits up to about 2 hours on a Gemini outage and has 5 hours in all, so a
  run that stopped is restarted within 4.5 hours of the request. A restart that finds the
  first run still going is skipped, and the next window sends it again, 4 hours later. With
  the 24-hour maximum age, a stuck request gets about 5 runs before it is
  cancelled; the maximum age must exceed the threshold, the interval and a run's budget, and
  a test holds it.
- A scorer outage therefore leaves a request pending until a restart finds Gemini back. A
  contract that does not answer is logged `reconcile-unreachable` and read on the next tick;
  requests that do not answer are logged `reconcile-unreadable: <contract>: <n> of <m>
  requests` and read again when their page comes round.
- It runs wherever the oracle key is (ADR 0019), a developer's computer included, where it
  starts a request the page never announced.

## Notifications and alerts

One `notify({ level, text, title, link })` (`createNotify`) tells the maintainer everything,
in one Telegram chat for every environment
([ADR 0038](../../docs/adr/0038-alerts-go-to-one-telegram-chat.md)), in Telegram's HTML: a bold
headline and the environment (`🚨 Alert · staging`, or activity's own headline, such as
`⭐ Rated 91/100 · staging`), then the alert's text, or the paper's title in bold and a short
link (`→ Open the rating`); every part is escaped. Without `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` (anywhere but production, which requires them) it only logs the message, as one plain line (`[staging · alert] …`); a send that fails is
logged `notify-unavailable: telegram: …` and never fails the run that sent it. Every send is a
step of its own, so a replay never sends it twice.

- **Activity:** a paper published (`📄 Published`, the publish run's **notify**), a rating
  scored or cancelled (`⭐ Rated <score>/100`, `⚠️ Rating cancelled: <why>`, the rating run's
  **notify**), each with the paper's title and a link to its page (`publishedNotice`,
  `ratedNotice`, `siteUrlOf`).
- **A failed or cancelled run:** `alert-on-failure`, on every function's
  `inngest/function.failed`, names the function, the run and the first line of its error,
  whose `publish-failed:`, `rating-failed:` or `oracle-failed:` prefix says why; on
  `inngest/function.cancelled`, sent for a run past its time budget (`timeouts.finish`) or one
  cancelled by hand, it names the function and the run.
- **The oracle and orphans:** an oracle without funds (**alert-no-funds**), a transaction at
  the fee cap (**alert-fee-cap**), an orphan R-KA (the rating run's **alert-orphan**), and an
  R-KA an oracle move may leave unrecorded (**alert-oracle-moved**).
- **Every hour,** `check-health` alerts on the DKG node not answering its open `/api/status`
  within 10 s, or listing the environment's graph not `accepted` from `finalized-chain` (or not
  at all); the oracle's ETH, and each publisher wallet's ETH on Base Sepolia, under 0.005; a
  publisher wallet's TRAC under 100; and requests pending past 6 hours, with how many and the
  oldest. It reads the node in one step (`check-node`), the balances in another
  (`check-balances`),
  then each contract in a step of its own (`check-pending-<contract>`), one after the other:
  at most 2 pages of pending ids a contract an hour (200 requests, 10 at a time), each hour
  going on from the last, so a spam backlog is read in turns and the alert says how many it
  read. A balance that does not answer is logged `health-unreadable: <role> <address>:
  ETH|TRAC` (`oracle` or `publisher`) and read again the next hour; a contract is logged
  `health-unreachable`, and requests that do not answer `health-unreadable` with their number. One alert lists every problem, from its
  own step (`alert`); nothing is sent when all is well. It runs where the oracle key is.

## The pages' calls

`getUploadService()` serves `apps/web`'s pages: the upload page
([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)), the paper's page and the
papers list:

- **`createUploadUrl()`** signs a Pinata upload URL, valid 5 minutes, for one file of at most
  15 MB detected as `application/pdf`, pinned with `cid_version` `v1` like `publish-pdf`, so
  one PDF keeps one CID (`docs/domain.md` → IPFS).
- **`submitPaper(input, limiter)`** checks a signed `{ cid, contextGraph, deadline,
  submitter, signature }` as the run does. A PDF whose Target KA is already minted starts
  nothing and counts nothing: the result gives its UAL instead of an event id. Otherwise it
  checks the submitter's limit (`rate-limited`), then the file pinned under that CID on
  Pinata's public network (`not-pinned` when there is none). A file over 15 MB or not a PDF
  is refused (`too-large`, `not-a-pdf`). A file that is not a PDF is also unpinned when its
  Target KA is known missing; a PDF stays pinned, since every environment shares Pinata's
  one file per CID and their size limits may differ
  ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)). It then sends
  `labstrail/paper.submitted` with no time of its own, so Inngest stamps it, under the id
  `paper:<cid>:<submitter>:<deadline>`: Inngest drops a repeat of one signed submission for
  24 hours. A new signature starts a run unless one for that CID is active (the singleton),
  and the paper's page then follows the paper on the node. It returns Inngest's event id.
  Only a sent submission is counted. A chain, Pinata, limit store or Inngest that does not
  answer gives `unavailable` and logs one warning naming it, `submit-unavailable: <service>:
  <what came back>` (`chain-rpc`, `upstash`, `pinata`, `inngest`), for example
  `submit-unavailable: inngest: fetch failed (connect ECONNREFUSED 127.0.0.1:8288)`; the line
  never carries a key, a URL or the signature. A node that does not answer leaves the
  already-minted check to the run.
- **`readPaper(cid, eventId?)`** reads the Target KA's state on the node and, given the
  event id, the run Inngest started for it (REST, from the dev server locally). Once the KA
  is minted, it also reads the record back from the asset's own graph (SPARQL through the
  node: title, authors, DOI, PDF link, submitter, signature, deadline) and, alongside it,
  when the node minted it (`publishedAt`, from the graph's `_meta` with `publishedPaperQuery`;
  left out when the node does not give it, the record standing without it), checks the
  signature against the submitter as the run does, without the deadline rule (`unknown` when
  the chain does not answer within 3 s), and gives the agent address the asset is minted to
  (`publisher`: the UAL's author, our node). A failed run's status carries `failure`, the
  reason its error names; a minted paper whose record cannot be shown carries
  `recordProblem`: `unavailable` when the node did not answer the query, asked to retry, or
  answered 429 or a server error; `unreadable` when it refused the query, no record parses,
  or the asset's UAL names another agent than our node
  ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)). Locally, a run's
  output comes from the dev server's GraphQL API, since its REST read answers it empty.
- **`listPapers({ page, pageSize })`** reads one page of this graph's published papers,
  newest mint first, from the node, with no database
  ([ADR 0035](../../docs/adr/0035-limits-are-the-apps-only-state.md)): only Target KAs our
  node minted, each read from its own asset's graph (`packages/core` → Target KAs). It asks
  for the page, with each paper's author count, and the total at once, then for the page's
  first three authors, then checks each signature as `readPaper` does; a check that waits on
  the chain for more than 3 s shows as `unknown`, so a slow RPC never holds the page. It returns
  `{ ok: true, total, papers }`, each paper's `PaperSummary` with its CID, UAL, mint date,
  title, first authors, author count, submitter and signature check; a page past the last
  has no papers. A node that does not answer, asks to retry, or answers 429 or a server error
  gives `unavailable`; a refused query, a count that does not parse, or a page the total
  covers that comes back with no readable row gives `unreadable`
  ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)). A page or page size
  that is not a positive integer, a page size over 50, or a page whose offset is not a safe
  integer throws a `RangeError`.

`getRatingService()` serves the rating parts of the pages: the paper's page, each rating's
page and its `/api/ratings/<id>` route, and the papers list's Score column. It reads the
environment's contracts, current and past, on Base Sepolia, or locally only the Anvil one
([ADR 0036](../../docs/adr/0036-local-rating-runs-use-anvil.md)), and needs no oracle key.
Its chain client (`createSiteChainClient` in `src/site/chain.ts`) sends the contract reads a
page makes together, every paper on every contract, as one Multicall3 call, since RPC
endpoints refuse a burst of calls (Base's public endpoint; Alchemy RPC's free tier, about 19
a second, `docs/domain.md` → Chain): the papers list
makes three such calls one after the other (the counts, the ids, the requests). Each call
gets 5 s and is asked once more a second after a failure or a 429 (longer when a 429 carries
`Retry-After`, which viem waits out), so a chain that does not answer costs a page about 11 s
([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)). On Anvil, which has no
Multicall3, each read is its own call. The upload service's client is the same; a smart
wallet's signature check, an `eth_call` with no contract address, is sent on its own.

- **`listRatings(targetUal)`** gives every request for the paper on those contracts, oldest
  first (`readRequestIdsOf`, then each request), or `unavailable` when a contract does not
  answer. The contract's score is the one given
  ([ADR 0014](../../docs/adr/0014-contract-owns-scores-dkg-owns-content.md)).
- **`paperRatingSummaries(targetUals)`** sums each paper's requests with `summariseRatings`,
  for the papers list: the latest score, else `pending`, else `cannot-rate` when a request was
  cancelled `invalid-target`, else `unrated`. A paper whose read takes more than 6 s is
  `unknown`, so a slow chain never holds the list: the budget covers its three rounds of reads
  and one quick retry, such as after a 429, but not a first try that runs out its 5 s.
- **`readRating(requestId)`** finds the request on the contracts, current first: `not-found`
  when none holds it, `unavailable` when one did not answer and none holds it. A pending
  request carries its stage, read from its R-KA's state on the node (`scoring` with no asset
  yet, `saving` a draft, `minting` stored, `recording` minted, `unknown` when the node does
  not answer). A fulfilled one carries its R-KA's record (study type, rationale, every check
  with its answer and quote, and what the scorer claimed for a check that lost its point),
  read back from the node, and `gap` when the R-KA's score differs from the contract's; or
  `recordProblem`, as `readPaper` words it.
- **`announceLocalRating(txHash)`**, locally only, stands in for the Alchemy Notify webhook
  ([ADR 0017](../../docs/adr/0017-chain-events-are-ingested-at-least-once.md)): it reads the
  transaction's receipt on Anvil itself, finds a `Phase1Requested` log of the Anvil contract,
  and sends its event with `ratingRequestedEvent`, so the id is the one the webhook would
  give. Deployed it answers `not-local`; a receipt with no such log gives `no-request`; Anvil or
  Inngest not answering gives `unavailable` and logs `rating-announce-unavailable: anvil: …` or
  `rating-announce-unavailable: inngest: …`.

## Running a publish locally

1. Fill the DKG and publish sections of the root `.env.local` ([`.env.example`](../../.env.example)):
   the node server's URLs and the `local` credential
   ([`docs/node-host.md`](../../docs/node-host.md) → The developer's computer).
2. Nothing to start for the node or GROBID: both run on the node server.
3. `pnpm dev`, then, in another terminal, `pnpm --filter @labstrail/web inngest` (the
   Inngest dev server, at http://localhost:8288).
4. `pnpm --filter @labstrail/workflows publish-pdf <file.pdf>` pins the PDF on Pinata's public
   network with CIDv1 import settings, signs it with a throwaway key and sends the event. A
   relative path is read from the directory you type the command in.
   The run's steps and result show in the dev server.
5. Or publish through the page: open http://localhost:3000/publish with `REOWN_PROJECT_ID`
   set ([`apps/web`](../../apps/web/README.md#environment)). When the page says a service
   didn't answer, the `pnpm dev` terminal names it in a `submit-unavailable` or
   `upload-url-unavailable` warning: `inngest` with `ECONNREFUSED 127.0.0.1:8288` means the
   Inngest dev server is not running. A run that stops later names its reason in the dev
   server instead (GROBID down shows as `paper-unreachable`).

## Running a rating locally

The rating functions run only against a contract whose oracle key you hold: locally, a
RatingController on Anvil ([ADR 0036](../../docs/adr/0036-local-rating-runs-use-anvil.md)).
R-KAs still go to the staging graph.

1. Start `anvil --port 8546` in a terminal of its own (the port `.env.example` names, clear
   of the RPC proxy's 8545 on a computer that runs a node). The DKG node is the node
   server's ([`docs/node-host.md`](../../docs/node-host.md) → The developer's computer).
2. Deploy the contract on Anvil
   ([`packages/contracts` → Deploying on Anvil](../contracts/README.md#deploying-on-anvil)).
3. In the root `.env.local`, set `ORACLE_PRIVATE_KEY` to the key of Anvil's second account,
   `GEMINI_API_KEY`, `LOCAL_CHAIN_RPC_URL=http://127.0.0.1:8546` and `LOCAL_RATING_CONTRACT`
   ([`.env.example`](../../.env.example)), with the DKG and publish settings.
4. `pnpm dev`, then, in another terminal, `pnpm --filter @labstrail/web inngest`.
5. `pnpm --filter @labstrail/workflows rate-paper <target UAL>` requests a rating of a paper
   from the staging graph, from a throwaway requester it funds on Anvil, and sends the event.
   It prints the request id; the run shows in the dev server. `--raw` sends the UAL as typed,
   to see an invalid one cancelled.
6. `cast call <contract> "getRatingRequest(bytes32)" <request id> --rpc-url http://127.0.0.1:8546`
   shows the request, its score and its R-KA once fulfilled.

Or rate through the pages, after steps 1 to 4:

1. Set `REOWN_PROJECT_ID` for the wallet window
   ([`apps/web`](../../apps/web/README.md#environment)), and add Anvil to your wallet as a
   network (chain id 31337, RPC `http://127.0.0.1:8546`); the wallet window offers it only
   with `APP_ENV=local`.
2. `pnpm --filter @labstrail/workflows fund-local <your address>` gives that address 1 ETH on
   Anvil, for the request's gas.
3. Open a published paper's page, click **Rate this paper** and confirm in the wallet. The page
   waits for the receipt, then has the server announce the request (`announceLocalRating`),
   and opens the rating's page, which follows it to its score. A Gemini outage shows as the
   first step taking long: the run waits up to about 2 hours, then stops, and the reconciler
   restarts it after 4 hours.

To check the webhook route and the reconciler locally:

1. Set `ALCHEMY_WEBHOOK_SIGNING_KEY` to any value in the root `.env.local`, and restart
   `pnpm dev`.
2. `pnpm --filter @labstrail/workflows rate-paper <target UAL> --no-event` requests a rating
   without sending its event, and prints the transaction.
3. `pnpm --filter @labstrail/workflows post-webhook <transaction>` posts that transaction's logs
   to the route as a signed Alchemy Notify delivery; it prints the route's answer, and the run
   starts in the dev server.
4. Or leave the request unannounced: the reconciler starts its run once it is 4 hours old, if
   the dev server runs crons (`docs/domain.md` → Inngest and Vercel).

Restarting Anvil empties it: deploy again (the first deploy on a fresh chain gets the same
address). Request ids still never repeat, since each one hashes the contract's deploy time
([`packages/contracts` → RatingController](../contracts/README.md#ratingcontroller)). Each
`rate-paper` request comes from a new requester, so each run starts clear of the per-requester
cap, whatever earlier runs left pending. Requests from your own wallet, through the pages, count
against its cap of 3 while they are pending, announced or not; restarting Anvil clears them.

The script, and the paper page through `announceLocalRating`, stand in for the Alchemy Notify
webhook: each reads the `Phase1Requested` log from the request's receipt and builds the event
with `ratingRequestedEvent`, the function the webhook's intake calls. From the event on, the run
is the one staging runs: the contract and its oracle, the target read from the staging graph,
Gemini's score, the R-KA minted on Base Sepolia, and the oracle's transaction and receipt.
The Alchemy Notify webhook's signed delivery, Inngest crons in a branch environment and Base's handling of a
stuck transaction are checked on `develop`; the unit tests cover every branch with mocks.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @labstrail/workflows typecheck` | Typechecks the package and its scripts |
| `pnpm --filter @labstrail/workflows test` | Runs its Vitest project (`vitest run`) with mocked adapters |
| `pnpm --filter @labstrail/workflows publish-pdf <file.pdf>` | Dev only: pins a PDF, signs it and sends `labstrail/paper.submitted` to the local dev server |
| `pnpm --filter @labstrail/workflows rate-paper <target UAL> [--raw] [--no-event]` | Dev only, `APP_ENV=local`: requests a rating on the Anvil contract from a throwaway requester and sends `labstrail/rating.requested` to the local dev server; `--no-event` sends nothing and prints the transaction |
| `pnpm --filter @labstrail/workflows post-webhook <tx hash> [--url <route>]` | Dev only, `APP_ENV=local`: posts a transaction's logs on Anvil to the webhook route as an Alchemy Notify delivery signed with `ALCHEMY_WEBHOOK_SIGNING_KEY` |
| `pnpm --filter @labstrail/workflows fund-local <address>` | Dev only, `APP_ENV=local`: gives the address 1 ETH on Anvil, so its wallet can request a rating from the paper page |
| `pnpm --filter @labstrail/workflows score-papers [--field] [id…]` | Dev only, `APP_ENV=local`: scores the reference papers with Gemini and compares each with what is expected, or with `--field` runs only the publish run's field check on them (Measuring the scorer above) |

Ships TypeScript source (`src/index.ts`, `src/env.ts`), with no build step. The source is
grouped by feature: `src/publish/`, `src/rating/`, `src/pdf/`, `src/gemini/`, `src/site/` and
`src/alerts/`
(`CLAUDE.md` here).
