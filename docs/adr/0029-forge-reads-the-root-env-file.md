# 0029. Forge reads the root env file

- Status: Accepted
- Date: 2026-10-05
- Amends: [0004](0004-each-workspace-declares-its-env.md) (variables read by tools outside TypeScript)

## Context

[0004](0004-each-workspace-declares-its-env.md) keeps every env value in the root env files and has each workspace declare what it reads in `src/env.ts`. Foundry needs a few values of its own to deploy, such as an RPC URL and a block-explorer key. Forge reads them from the shell or from a `.env` file next to `foundry.toml`, and validates them itself; no TypeScript reads them, so a `src/env.ts` would declare values that nothing in TypeScript uses.

## Decision

- Amending 0004: forge reads the same root env file as the app, so developers keep one file of values.
- Variables read only by forge are listed in `.env.example` in their own section, and have no `src/env.ts`. The scripts that read them check them.
- The rest of 0004 stands for everything TypeScript reads.

## Consequences

- One place to fill in values, for the app and for deploys.
- Forge sees every value in the root file, secrets included, as every module of a deployment already does ([0004](0004-each-workspace-declares-its-env.md)).
- A forge variable is checked only when a script runs, by that script.
