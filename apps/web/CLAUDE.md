# apps/web

Next.js 16 App Router app. See `README.md` here for scripts and status.

- May import all five `@verisci/*` packages; each must be listed in `transpilePackages`
  in `next.config.ts`, or the import fails at build time.
- Server-only code (secrets, `@verisci/env`, adapters) stays in server components, route
  handlers or server actions, never in a `"use client"` file.
- Env files live at the repo root; `next.config.ts` loads them and ignores any in
  `apps/web`. Never read them (see the root `CLAUDE.md` hooks).
- Vitest runs in `jsdom` here. `pnpm --filter @verisci/web typecheck` runs `next typegen`
  first; `next-env.d.ts` is generated, never edit it.
- Playwright end-to-end tests arrive in M7; until then, cover logic in unit tests.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
