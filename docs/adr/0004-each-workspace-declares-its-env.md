# 0004. Each workspace declares its own env variables

- Status: Accepted
- Date: 2026-10-02

## Context

Every adapter needs configuration (URLs, keys, wallets). One central schema would make every workspace require every variable, secrets included, and a missing variable would surface late, deep in a request.

## Decision

- Each workspace declares only the variables it reads, in its own `src/env.ts`, with `defineEnv` from `@verisci/env` over the shared `NODE_ENV`/`APP_ENV` base. Envs passed to `extends` keep the values they were built with.
- Validation fails fast on import, with one `EnvError` naming every bad variable and never carrying a value.
- `NODE_ENV` belongs to the tools. `APP_ENV` defaults to `local`, but is required in production builds, so a host that forgets it fails instead of running as `local`.
- Env files live at the repo root, loaded by `apps/web/next.config.ts`. CI builds with `APP_ENV=local`.
- `SKIP_ENV_VALIDATION` is needed by nothing today, and is never used for `next build` (it would prerender `undefined`) or in a running app.

## Consequences

- A workspace's env object exposes only what it declares, and a bad config fails at startup with a clear message. This is hygiene, not isolation: every module in a deployment shares one `process.env`, so a secret set on a host is readable by all the code it runs.
- Each plan that reads a new variable adds it to its workspace's `src/env.ts` and to `.env.example`.
- Usage is documented in the [`@verisci/env` README](../../packages/env/README.md).
