# @verisci/env

Typed access to environment variables for every other workspace.

Status: placeholder. Plan 005 fills it in.

## Depends on

No other workspace.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/env typecheck` | Typechecks the package |
| `pnpm --filter @verisci/env test` | Runs its Vitest project (`vitest run`) |

Ships TypeScript source (`src/index.ts`), with no build step.
