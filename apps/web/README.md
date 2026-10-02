# @verisci/web

The Next.js 16 app (App Router).

Status: placeholder. The home page imports one export from each package, to
prove the source-only packages compile through `transpilePackages`.

## Depends on

All five packages: `@verisci/env`, `@verisci/core`, `@verisci/dkg`,
`@verisci/contracts`, `@verisci/agents`. Each one must be listed in
`transpilePackages` in `next.config.ts`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/web dev` | Starts the dev server on http://localhost:3000 |
| `pnpm --filter @verisci/web build` | Production build |
| `pnpm --filter @verisci/web start` | Serves the production build |
| `pnpm --filter @verisci/web typecheck` | Generates Next's types (`next typegen`), then runs `tsc` |
