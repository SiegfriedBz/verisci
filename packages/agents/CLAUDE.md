# packages/agents

Inngest workflows that combine `core` logic with the `dkg` and `contracts` adapters. See
`README.md` here.

- May import `@verisci/core`, `@verisci/env`, `@verisci/dkg` and `@verisci/contracts`.
- Orchestrate here; put the rules themselves in `core` so they stay pure and testable.
- Mock the adapters in tests.
- ADRs that govern workflows: every write converges (0007), mints are polled with
  `step.sleep` (0008), retries are spaced with `step.sleep` (0009), oracle transactions
  go only through the oracle function (0019), one singleton run per request (0020), a
  publish run is a singleton per CID and keeps a KA's first submitter (0010).
  See [`docs/adr/`](../../docs/adr/README.md).
- Workflow logic takes its step tools and adapters as arguments (`PublishSteps`,
  `PublishDeps`), so tests run it with fakes; `src/functions.ts` builds the real adapters
  on a function's first run. Never import `src/env.ts` from the main entry: `web` imports
  it, and `next build` must pass with only `APP_ENV` set.
- Step ids are unique per run (`read-1`, `wait-1-3`, `poll-1-3`); every wait is a
  `step.sleep`, never a sleep inside a step.
- Adapters return typed results and never throw for an expected failure, as ADR 0021
  asks of server reads. A run throws `NonRetriableError` only when its settings are
  invalid (`loadDeps`), when the node or GROBID refuses our credential, when the node does
  not serve the graph, and when its attempts run out. A deployed server checks the
  settings at start too (`apps/web/instrumentation.ts`).
