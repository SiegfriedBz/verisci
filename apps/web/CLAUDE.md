# apps/web

Next.js 16 App Router app. See `README.md` here for scripts and status.

- May import all five `@verisci/*` packages; each must be listed in `transpilePackages`
  in `next.config.ts`, or the import fails at build time.
- Server-only code (secrets, `@verisci/env`, adapters) stays in server components, route
  handlers or server actions, never in a `"use client"` file.
- Env files live at the repo root, never in `apps/web`; `next.config.ts` loads them,
  and editing one needs a dev server restart. Never read them (see the root
  `CLAUDE.md` hooks).
- Vitest runs in `jsdom` here. `pnpm --filter @verisci/web typecheck` runs `next typegen`
  first; `next-env.d.ts` is generated, never edit it.
- Server reads and actions return typed results: never throw an expected failure to the
  client, never swallow it into empty data
  ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)).
- Inngest functions live in `@verisci/workflows`; `web` only serves them
  ([ADR 0003](../../docs/adr/0003-inngest-functions-live-in-workflows.md)).
- Playwright end-to-end tests come in a later plan; until then, cover logic in unit tests.
  Put a flow's logic in `lib/` with its IO passed in (`publishFile`, `paperProgress`,
  `requestUploadUrl`), and keep components and `app/actions.ts` thin.
- Styling is Tailwind v4 with the tokens and classes in `app/globals.css` (`glass`,
  `signal-gradient`, `text-muted`, `text-accent`…): dark only, emerald for off-chain and
  cyan for on-chain (nothing else), no raw colours; `rounded-2xl` panels, `rounded-xl`
  buttons and inputs, `rounded-lg` small controls, `rounded-md` flags. Check every page at
  360, 768 and 1280 px with no horizontal scroll. Page copy follows the
  `design-taste-frontend` and humanizer skills: plain words, no em dashes.
- Wallet hooks (wagmi, AppKit) run only under `Providers` with a project id: render them
  behind `useWalletReady()`. Never pass server-only values to a client component except
  as plain props; client components never import `@verisci/workflows` at runtime (types
  only).
- Reads the page polls are route handlers, not server actions: Next runs server actions
  one at a time per client.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
