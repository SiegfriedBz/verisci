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
