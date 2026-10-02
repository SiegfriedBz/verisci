# packages/core

Pure domain logic. See `README.md` here.

- **No IO**: no `fetch`, no `node:*` imports, no other `@verisci/*` package. Biome fails
  `pnpm check` on any of them ("core does no IO"). Inject data instead; IO belongs in
  `dkg`, `contracts` or `agents`.
- Coverage threshold is 90% branches, the strictest in the repo: test every branch.
- Pure functions and plain data types; no classes holding hidden state.
