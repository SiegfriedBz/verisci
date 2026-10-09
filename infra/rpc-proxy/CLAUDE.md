# infra/rpc-proxy

JSON-RPC proxy for the DKG daemon, run on the DKG node server. See `README.md` here.

- Runs with plain Node 22.18+ (type stripping): no runtime dependency, no other
  workspace, only erasable TypeScript (`erasableSyntaxOnly`). Relative imports keep `.ts`.
- Reads its own settings in `src/config.ts` (ADR 0004); error messages never include a
  value, since `UPSTREAM_RPC` holds Alchemy's key. Log lines never print that URL either.
- Alchemy is always asked last and within the daily budget: a change that sends more to
  Alchemy needs a reason and a test.
- `src/proxy.ts` takes the network (`post`), clock and `sleep` as arguments; tests fake
  them and never touch the network. `src/main.ts` only wires the real ones.
