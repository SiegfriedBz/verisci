# apps/web

Next.js 16 App Router app. See `README.md` here for scripts and status.

- May import all five `@verisci/*` packages; each must be listed in `transpilePackages`
  in `next.config.ts`, or the import fails at build time.
- Server-only code (secrets, `@verisci/env`, adapters) stays in server components, route
  handlers or server actions, never in a `"use client"` file.
- Vitest runs in `jsdom` here. `pnpm --filter @verisci/web typecheck` runs `next typegen`
  first; `next-env.d.ts` is generated, never edit it.
- Playwright end-to-end tests arrive in M7; until then, cover logic in unit tests.
