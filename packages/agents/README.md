# @verisci/agents

Inngest workflows that combine `core` logic with the `dkg` and `contracts` adapters;
`apps/web` only serves them ([ADR 0003](../../docs/adr/0003-inngest-workflows-live-in-agents.md)).

Status: placeholder.

## Depends on

`@verisci/core`, `@verisci/env`, `@verisci/dkg`, `@verisci/contracts`

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/agents typecheck` | Typechecks the package |
| `pnpm --filter @verisci/agents test` | Runs its Vitest project (`vitest run`) |

Ships TypeScript source (`src/index.ts`), with no build step.
