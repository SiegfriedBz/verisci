# @verisci/web

The Next.js 16 app (App Router).

Status: the upload pages, where a visitor connects a wallet, publishes a PDF and follows it
until its Target KA is minted, plus `/api/inngest`, which serves the agents' Inngest
functions ([ADR 0003](../../docs/adr/0003-inngest-workflows-live-in-agents.md)). A production
build validates the shared variables: `build` needs `APP_ENV` (see the
[`@verisci/env` README](../../packages/env/README.md)).

## Pages and routes

| Path | What it is |
| --- | --- |
| `/` | Home: what verisci does, and the way to publish |
| `/publish` | Connect a wallet, drop a PDF, sign once ([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md), [ADR 0034](../../docs/adr/0034-users-connect-a-wallet-anyone-may-publish.md)) |
| `/papers/<cid>?event=<id>` | Where a paper stands, polled every 5 s until published, refused or stopped |
| `/api/papers/<cid>?event=<id>` | The same as JSON (`PaperStage`), never cached: a read, so a route rather than a server action |
| `/api/inngest` | Serves the Inngest functions |

The publish form calls two server actions (`app/actions.ts`): `requestUpload()` signs a
Pinata upload URL within the connection's daily limit, and `submitPaper(input)` checks the
signed submission and starts its publish run within the address's daily limit
([ADR 0035](../../docs/adr/0035-limits-are-the-apps-only-state.md)). The browser uploads the
PDF straight to Pinata, canonicalizes the CID it answers, and has the wallet sign
`{ cid, contextGraph, deadline }` with a deadline 10 minutes ahead. The work itself is
`@verisci/agents`' `getUploadService()` ([`packages/agents`](../../packages/agents/README.md#the-upload-pages-calls)).

Limits (`lib/limits.ts`): 20 upload URLs per connection (IP) and 5 submissions per signing
address, each per rolling day, in Upstash; in memory with `APP_ENV=local` and no Upstash
settings, reset when the server restarts. A limit store that does not answer refuses
rather than letting requests through.

## Design

Tailwind CSS v4 (`app/globals.css`): cool greys and one emerald accent as CSS variables, light
and dark from the system setting, Geist and Geist Mono (`next/font`), Phosphor icons, one
radius scale, motion only on the step being worked on and respecting reduced motion. Every
page works from 360 px wide, one column on phones. On-chain values show in Geist Mono, in
short form with a copy button.

## Depends on

All five packages: `@verisci/env`, `@verisci/core`, `@verisci/dkg`,
`@verisci/contracts`, `@verisci/agents`. Each one must be listed in
`transpilePackages` in `next.config.ts`. Also `inngest` (the `/api/inngest` route's `serve`
handler); Reown AppKit, wagmi, viem and TanStack Query (the wallet); `@upstash/ratelimit`
and `@upstash/redis` (the limits); Tailwind CSS and Phosphor icons. `next.config.ts` points
the optional `@x402/*` packages, reached through wagmi's connectors, at `lib/empty-module.ts`
(`docs/domain.md` → Next.js).

## Environment

`next.config.ts` loads env files from the repo root (`.env.local` and friends; see
[`.env.example`](../../.env.example)). Keep them there, not in `apps/web`: Next.js
would mix the two unpredictably when it reloads. Next.js only watches `apps/web`,
so restart `pnpm dev` after editing a root env file. Variables already set in the
environment (CI, the host) take precedence.

Its own settings are declared in `lib/web-env.ts` (`createWebEnv`), all three required
unless `APP_ENV` is `local`:

| Variable | Value |
| --- | --- |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis's REST address and token, for the limits. The token is secret |
| `REOWN_PROJECT_ID` | The Reown project id for the wallet window, read on the server and handed to the page, so nothing is inlined at build time. Without it the pages say the wallet is not set up |

The pages also need the agents' settings (DKG, Pinata, chain, Inngest;
[`packages/agents`](../../packages/agents/README.md#environment)). With `APP_ENV=local`,
`/api/inngest` and the upload page talk to the Inngest dev server. `instrumentation.ts`
checks the agents' and the web app's settings when a deployed server starts, so a bad one
stops it there. It checks nothing when `APP_ENV` is `local`, and does not run during
`next build`. On Vercel, a server starts on a request after the deploy is live, so a
missing setting makes every route fail: set them in each Vercel environment before its
first deploy, and allow each deployed domain in the Reown project.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/web dev` | Starts the dev server on http://localhost:3000 |
| `pnpm --filter @verisci/web build` | Production build; needs `APP_ENV` (from the root `.env.local` locally) |
| `pnpm --filter @verisci/web start` | Serves the production build |
| `pnpm --filter @verisci/web inngest` | Starts the Inngest dev server (http://localhost:8288), pointed at `/api/inngest`; run it next to `dev` |
| `pnpm --filter @verisci/web typecheck` | Generates Next's types (`next typegen`), then runs `tsc` |
| `pnpm --filter @verisci/web test` | Runs its Vitest project (`vitest run`) |
