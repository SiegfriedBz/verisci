# @verisci/web

The Next.js 16 app (App Router).

Status: placeholder. The home page imports one export from each package, to
prove the source-only packages compile through `transpilePackages`. From
`@verisci/env` it reads `sharedEnv.APP_ENV`, so a production build validates
the shared variables: `build` needs `APP_ENV` (see the
[`@verisci/env` README](../../packages/env/README.md)).

## Depends on

All five packages: `@verisci/env`, `@verisci/core`, `@verisci/dkg`,
`@verisci/contracts`, `@verisci/agents`. Each one must be listed in
`transpilePackages` in `next.config.ts`.

## Environment

`next.config.ts` loads env files from the repo root (`.env.local` and friends; see
[`.env.example`](../../.env.example)), not from `apps/web`: any env file here is
ignored. Variables already set in the environment (CI, the host) take precedence.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/web dev` | Starts the dev server on http://localhost:3000 |
| `pnpm --filter @verisci/web build` | Production build; needs `APP_ENV` (from the root `.env.local` locally) |
| `pnpm --filter @verisci/web start` | Serves the production build |
| `pnpm --filter @verisci/web typecheck` | Generates Next's types (`next typegen`), then runs `tsc` |
| `pnpm --filter @verisci/web test` | Runs its Vitest project (`vitest run`) |
