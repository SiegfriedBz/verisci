# packages/workflows

Inngest workflows that combine `core` logic with the `dkg` and `contracts` adapters. See
`README.md` here.

- May import `@labstrail/core`, `@labstrail/env`, `@labstrail/dkg` and `@labstrail/contracts`.
- Orchestrate here; put the rules themselves in `core` so they stay pure and testable.
- Mock the adapters in tests.
- ADRs that govern workflows: Inngest functions live here and `web` only serves them
  (0003), every write converges (0007), mints are polled with `step.sleep` (0008), retries
  are spaced with `step.sleep` (0009), the backend's oracle transactions go only through
  the oracle function, which checks receipts in later steps (0019), one singleton run per
  request (0020), the scorer's output contract (0018), a publish run is a singleton per
  CID, keeps a KA's first submitter and refuses a paper outside the field (0010, 0037), a refused file is unpinned only if it is not
  a PDF (0010, 0005), local rating runs target a contract on Anvil (0036). The rating run
  also applies: a rating is its own R-KA (0011), phases settled by the oracle (0012), the
  contract owns scores and the DKG content (0014), requests free and throttled on testnet
  (0015), the R-KA named from the request id (0016), events taken at least once (0017), a
  fix is a redeploy, so past contracts are still served (0023), canonical UALs (0031),
  only life-science and health papers rated (0037), checked first with Flash-Lite. The
  webhook's intake follows 0017, the reconciler 0020, and notifications and alerts 0038.
  See [`docs/adr/`](../../docs/adr/README.md).
- Workflow logic takes its step tools and adapters as arguments (`PublishSteps`,
  `PublishDeps`, `RatingSteps`, `RatingDeps`, `OracleSteps`, `OracleChain`,
  `ReconcilerSteps`, `HealthSteps`, `FailureAlertSteps`), so tests run it with fakes; `src/functions.ts` builds the real adapters
  on a function's first run. Never import `src/env.ts` from the main entry: `web` imports
  it, and `next build` must pass with only `APP_ENV` set.
- **Layout:** `src/publish/` (the publish run and its adapters: GROBID, Pinata),
  `src/rating/` (the rating run, the scorer, the oracle, the rating event, and the
  environment's contracts, which the site service shares), `src/pdf/` (fetching a pinned PDF
  and reading its text, which both runs use), `src/gemini/` (the Gemini call the scorer and
  the field check, made by both runs, share), `src/site/` (the services the web app calls: upload
  URLs, submissions, a paper's status, the papers list, its ratings, and the Alchemy Notify
  webhook's intake), `src/alerts/` (the Telegram notifier, the messages, the failure alerts and
  the health check). The reconciler sits in `src/rating/`, with the pending reads
  (`pending.ts`) the health check shares. At the root only the entry
  (`index.ts`), the settings (`env.ts`, `*-env.ts`), the wiring (`functions.ts`) and the
  Inngest client. What both runs use goes in a shared folder such as `pdf/` or `gemini/`; a folder may
  import from another (the site service checks submissions with `publish/`, and reads
  ratings with `rating/`).
  `src/layout.test.ts` checks that each file sits in one of these folders (any `*-env.ts` at
  the root) and that the entry exports the same names.
- Step ids are unique per run, sleeps included (`read-1`, `wait-1-3`, `poll-1-3`,
  `read-paper-1-wait`); the rating run's fake steps fail a run that uses one twice. Every wait is a
  `step.sleep`, never a sleep inside a step. Each notification is sent from a step of its own
  (`notify`, `alert-orphan`, `alert-fee-cap`), never from the function body, which replays. A step whose result changes shape gets a new id
  (`score-paper-1` replaced `score-1`), so a run already going never reads an old result as a
  new one.
- Adapters return typed results and never throw for an expected failure, as ADR 0021
  asks of server reads. A run throws `NonRetriableError` only when its settings or
  its invocation's data are invalid (`loadDeps`, `loadRatingDeps`, the oracle's `setup`),
  when the node or GROBID refuses our credential or Gemini the request, when the node does
  not serve the graph, when a minted R-KA's score does not parse (`rating-unreadable`),
  when the oracle function fails or finds the request fulfilled with another R-KA
  (`oracle-failed`, `oracle-conflict`), and when its attempts or budget run out; its message starts `publish-failed:<reason>:` (`PublishFailure`, which the paper's
  page reads), `rating-failed:<reason>:` (`RatingFailure`) or `oracle-failed:<reason>:`
  (`OracleFailure`). A deployed server checks the settings at start too
  (`apps/web/instrumentation.ts`).
- Step outputs are kept as JSON: no `bigint` in a step's result (the oracle keeps fees as
  decimal strings). Tests' fake steps round-trip each output through JSON to catch it.
