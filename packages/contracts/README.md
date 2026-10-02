# @verisci/contracts

Solidity contracts (Foundry), plus the TypeScript side that the other
workspaces import.

Status: placeholder. This package only has its TypeScript side for now;
plan 002 adds the Foundry project to this folder.

## Depends on

`@verisci/core`, `@verisci/env`

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/contracts typecheck` | Typechecks the TypeScript side |

Ships TypeScript source (`src/index.ts`), with no build step.
