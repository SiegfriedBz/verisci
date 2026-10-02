# packages/dkg

Adapter between `core` and the DKG: reads and writes Knowledge Assets. See `README.md`
here.

- May import `@verisci/core` and `@verisci/env` only.
- Network and node access live here, behind functions that return `core` types, so
  `core` stays pure and `agents` and `web` never call the DKG directly.
- Mock the network boundary in tests; never hit a real node from Vitest.
