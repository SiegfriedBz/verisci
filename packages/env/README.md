# @verisci/env

Typed, validated environment variables for every other workspace. Each workspace
declares the variables it reads as Zod schemas; a missing or invalid variable fails
on first import with one `EnvError` that names every bad variable and never shows
its value.

Workflows (`@verisci/agents`) and the web app's own settings (`apps/web/lib/web-env.ts`) are
the exception, since `next build` imports them with only `APP_ENV` set: a deployed server
checks them when it starts (`apps/web/instrumentation.ts`) and refuses to start on a bad one;
locally (`APP_ENV=local`) a workflow checks its settings on its first run and stops at once,
and the web app on the request that reads them
([ADR 0004](../../docs/adr/0004-env-variables-per-workspace-one-root-file.md)).

Status: `defineEnv`, the shared `NODE_ENV`/`APP_ENV` schema and `EnvError`, used by every
workspace's env module.

## Depends on

[`@t3-oss/env-core`](https://env.t3.gg) and [Zod](https://zod.dev); no other workspace.

## Shared variables

`sharedEnv` holds the variables every workspace may read, validated from
`process.env` on first import.

| Variable | Values | Default |
| --- | --- | --- |
| `NODE_ENV` | `development`, `test`, `production` | `development` |
| `APP_ENV` | `local` (not deployed: a dev machine or CI), `staging` (`develop` and previews), `production` (`main`) | `local`, except in a production build |

`NODE_ENV` is set by the tools (`next dev`, `next build`, Vitest); never set it
by hand. When `NODE_ENV` is `production`, `APP_ENV` has no default. Set it per
host environment (on Vercel: Production → `production`, Preview → `staging`),
and `APP_ENV=local` in the root `.env.local` for a local `pnpm build`. Empty
strings count as unset.

Why the environments are split this way is
[ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md); why each workspace
declares its own variables and why `APP_ENV` is required in production builds is
[ADR 0004](../../docs/adr/0004-env-variables-per-workspace-one-root-file.md).

## Declaring a workspace's variables

Each workspace declares its variables in its env module (`src/env.ts` in a package,
`lib/web-env.ts` in `apps/web`; it may import the schema from a file next to it) and
extends the shared env. A workspace declares only what it reads, so no workspace requires (or sees) a secret it does not use.
A dev script (`scripts/*.ts`) declares the variables it reads with `defineEnv`, in the
script itself, so it requires only those: the agents' `publish-pdf` reads the Pinata key and
the context graph, not the rest of the agents' settings.

```ts
// packages/<workspace>/src/env.ts
import { defineEnv, sharedEnv } from "@verisci/env";
import { z } from "zod";

export const env = defineEnv({
  extends: [sharedEnv],
  server: { SOME_URL: z.url() },
});

env.SOME_URL; // string
env.APP_ENV; // "local" | "staging" | "production"
```

When tests must check the rules with their own values, put them in a function that takes
a `runtimeEnv` and extends `createSharedEnv(runtimeEnv)`, and have `src/env.ts` call it
once: `packages/dkg` does this (`createDkgEnv` in `src/dkg-env.ts`), since `src/env.ts`
validates `process.env` as soon as it is imported.

Envs in `extends` keep the values they were built with; they are not re-read from
the given `runtimeEnv`. `sharedEnv` is always built from `process.env`, so a test
or script with its own `runtimeEnv` extends `createSharedEnv(runtimeEnv)` instead.

The workspace adds `zod` to its own dependencies, pinned to the version `env` uses.
Add each new variable to the root [`.env.example`](../../.env.example) in the same PR.

Foundry's deployment settings are the exception: forge reads them from the same root
env file, so they are listed in the Foundry section of `.env.example` without a
`src/env.ts`, and forge validates them when it uses them. Per-deployment choices such
as `DEPLOY_ENV` are passed on the command line
([ADR 0004](../../docs/adr/0004-env-variables-per-workspace-one-root-file.md)).

Programs that run on the DKG node server (`infra/*`, such as the RPC proxy) read their
own settings from an env file on that server, since it runs them with plain Node and no
install. Each lists its variables in its README
([ADR 0004](../../docs/adr/0004-env-variables-per-workspace-one-root-file.md)).

## API

| Export | What it does |
| --- | --- |
| `defineEnv({ server, extends?, runtimeEnv? })` | Validates `runtimeEnv` (default `process.env`, never mutated) and returns a typed, read-only object; throws `EnvError` |
| `DefineEnvOptions`, `RuntimeEnv` | `defineEnv`'s options, and the variables it reads (`process.env` or a plain object) |
| `EnvError`, `EnvIssue` | `message` lists each variable and the schema's message; `issues` is `EnvIssue[]` (`{ variable, message }`). Never contains a value |
| `sharedSchema(runtimeEnv?)` | The Zod schemas for `NODE_ENV` and `APP_ENV`; `APP_ENV` is required when `runtimeEnv.NODE_ENV` is `production` |
| `sharedEnv`, `SharedEnv` | The shared variables, validated from `process.env`, and their type |
| `createSharedEnv(runtimeEnv?)` | Builds the shared env from a given object, for tests and scripts |

In tests, pass `runtimeEnv` explicitly rather than setting `process.env`.

## Skipping validation

`SKIP_ENV_VALIDATION=1` (or `true`) turns validation off. `defineEnv` then returns
the whole copy of `runtimeEnv` unchecked: every variable in `process.env`, secrets
included, with no defaults applied and without `extends` merged in.

Nothing in the repo needs it today. It is only for a step that imports env-declaring
modules without running code that reads the values. Never use it for `next build`,
where code that reads a setting at build time would get `undefined`, and never in a
running app.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/env typecheck` | Typechecks the package |
| `pnpm --filter @verisci/env test` | Runs its Vitest project (`vitest run`) |

Ships TypeScript source (`src/index.ts`), with no build step.
