# packages/agents

Agents that combine `core` logic with the `dkg` and `contracts` adapters. See
`README.md` here.

- May import `@verisci/core`, `@verisci/env`, `@verisci/dkg` and `@verisci/contracts`.
- Orchestrate here; put the rules themselves in `core` so they stay pure and testable.
- Mock the adapters in tests.
