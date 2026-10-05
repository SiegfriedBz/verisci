# @verisci/core

Domain logic. Core does no IO: no `fetch`, no `node:*` imports and no other
`@verisci/*` package. IO belongs in an adapter package such as `dkg` or
`contracts`.

`pnpm check` enforces this: `packages/core/biome.json` turns `fetch`,
`node:*` and `@verisci/*` into errors ("core does no IO").

Status: shared constants only.

## API

| Export | What it is |
| --- | --- |
| `BASE_SEPOLIA_CHAIN_ID` | 84532, the chain staging and production run on, which UALs also name ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)) |

## Depends on

No other workspace. pnpm does not hoist undeclared workspace packages, so an
import of another `@verisci/*` package fails to typecheck.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/core typecheck` | Typechecks the package |
| `pnpm --filter @verisci/core test` | Runs its Vitest project (`vitest run`) |

Ships TypeScript source (`src/index.ts`), with no build step.
