# packages/dkg

Adapter between `core` and the DKG: reads and writes Knowledge Assets. See `README.md`
here.

- May import `@verisci/core` and `@verisci/env` only.
- Network and node access live here, behind functions that return typed results
  (`src/types.ts`) and `core`'s normalized UALs, so `core` stays pure and `agents` and
  `web` never call the DKG directly.
- Mock the network boundary in tests; never hit a real node from Vitest.
- Every store and mint reads the asset's state first (ADR 0007); a store includes the
  share; `startMint` listens for `vm/publish` only briefly and returns `minting`, and
  the caller polls `readAsset` (0008); the env module refuses a `-prod` context graph
  unless `APP_ENV=production` (0005). See [`docs/adr/`](../../docs/adr/README.md).
- `src/env.ts` validates on import, so only `@verisci/dkg/env` imports it; the main
  entry (`src/index.ts`) never does, since the web app imports it.
- Calls return typed results (`DkgFailure`), never throw for an expected failure, and
  never put the token in a result.
