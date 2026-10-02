# @verisci/core

Domain logic. Core does no IO: no `fetch`, no `node:*` imports and no other
`@verisci/*` package. IO belongs in an adapter package such as `dkg` or
`contracts`.

Status: placeholder.

## Depends on

No other workspace. pnpm does not hoist undeclared workspace packages, so an
import of another `@verisci/*` package fails to typecheck.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/core typecheck` | Typechecks the package |

Ships TypeScript source (`src/index.ts`), with no build step.
