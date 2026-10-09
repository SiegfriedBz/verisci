# @verisci/dkg

Adapter between `core` and the DKG: reads and writes Knowledge Assets.

The DKG node it calls runs on the DKG node server
([ADR 0006](../../docs/adr/0006-dkg-node-runs-on-a-dedicated-host.md)): on a developer's
computer at `http://127.0.0.1:9200` for now, and once on a host, over HTTPS through Caddy
with a credential. The node reads the chain through
[`infra/rpc-proxy`](../../infra/rpc-proxy/README.md)
([`docs/node-host.md`](../../docs/node-host.md) → How the parts connect); a publish that fails
with `authority-resolution-failed` is often a chain-read problem there, not in this
package (`docs/domain.md` → DKG).

Status: placeholder.

## Depends on

`@verisci/core`, `@verisci/env`

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/dkg typecheck` | Typechecks the package |
| `pnpm --filter @verisci/dkg test` | Runs its Vitest project (`vitest run`) |

Ships TypeScript source (`src/index.ts`), with no build step.
