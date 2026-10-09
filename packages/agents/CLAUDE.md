# packages/agents

Inngest workflows that combine `core` logic with the `dkg` and `contracts` adapters. See
`README.md` here.

- May import `@verisci/core`, `@verisci/env`, `@verisci/dkg` and `@verisci/contracts`.
- Orchestrate here; put the rules themselves in `core` so they stay pure and testable.
- Mock the adapters in tests.
- ADRs that govern workflows: every write converges (0007), mints are polled with
  `step.sleep` (0008), retries are spaced with `step.sleep` (0009), oracle transactions
  go only through the oracle function (0019), one singleton run per request (0020).
  See [`docs/adr/`](../../docs/adr/README.md).
- Workflow logic takes its step tools and adapters as arguments (`PublishSteps`,
  `PublishDeps`), so tests run it with fakes; `src/functions.ts` builds the real adapters
  on a function's first run. Never import `src/env.ts` from the main entry: `web` imports
  it, and `next build` must pass with only `APP_ENV` set.
- Step ids are unique per run (`read-1`, `wait-1-3`, `poll-1-3`); every wait is a
  `step.sleep`, never a sleep inside a step.
- Adapters return typed results and never throw for an expected failure (ADR 0021); only
  configuration errors and exhausted retries throw `NonRetriableError`.
