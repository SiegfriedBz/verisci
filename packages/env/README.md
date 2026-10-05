# @verisci/env

Typed, validated environment variables for every other workspace. Each workspace
declares the variables it reads as Zod schemas; a missing or invalid variable fails
on first import with one `EnvError` that names every bad variable and never shows
its value.

Built on [`@t3-oss/env-core`](https://env.t3.gg) and [Zod](https://zod.dev).

## Depends on

No other workspace.

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
[ADR 0004](../../docs/adr/0004-each-workspace-declares-its-env.md).

## Declaring a workspace's variables

Each workspace keeps its schema in its own `src/env.ts` and extends `sharedEnv`.
A workspace declares only what it reads, so no workspace requires (or sees) a
secret it does not use.

```ts
// packages/dkg/src/env.ts
import { defineEnv, sharedEnv } from "@verisci/env";
import { z } from "zod";

export const env = defineEnv({
  extends: [sharedEnv],
  server: { DKG_URL: z.url() },
});

env.DKG_URL; // string
env.APP_ENV; // "local" | "staging" | "production"
```

Envs in `extends` keep the values they were built with; they are not re-read from
the `runtimeEnv` you pass. `sharedEnv` is always built from `process.env`, so a test
or script with its own `runtimeEnv` extends `createSharedEnv(runtimeEnv)` instead.

The workspace adds `zod` to its own dependencies, pinned to the version `env` uses.
Add each new variable to the root [`.env.example`](../../.env.example) in the same PR.
Variables read only by forge, for deploys, sit in its Foundry section and are checked
by the Foundry scripts that read them
([ADR 0029](../../docs/adr/0029-forge-reads-the-root-env-file.md)).

## API

| Export | What it does |
| --- | --- |
| `defineEnv({ server, extends?, runtimeEnv? })` | Validates `runtimeEnv` (default `process.env`, never mutated) and returns a typed, read-only object; throws `EnvError` |
| `EnvError` | `message` lists each variable and the schema's message; `issues` is `{ variable, message }[]`. Never contains a value |
| `sharedSchema(runtimeEnv?)` | The Zod schemas for `NODE_ENV` and `APP_ENV`; `APP_ENV` is required when `runtimeEnv.NODE_ENV` is `production` |
| `sharedEnv` | The shared variables, validated from `process.env` |
| `createSharedEnv(runtimeEnv?)` | Builds the shared env from a given object, for tests and scripts |

In tests, pass `runtimeEnv` explicitly rather than setting `process.env`.

## Skipping validation

`SKIP_ENV_VALIDATION=1` (or `true`) turns validation off. `defineEnv` then returns
the whole copy of `runtimeEnv` unchecked: every variable in `process.env`, secrets
included, with no defaults applied and without `extends` merged in.

Nothing in the repo needs it today. It is only for a step that imports env-declaring
modules without running code that reads the values. Never use it for `next build`,
which prerenders pages with the values (the home page would show `undefined`), and
never in a running app.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/env typecheck` | Typechecks the package |
| `pnpm --filter @verisci/env test` | Runs its Vitest project (`vitest run`) |

Ships TypeScript source (`src/index.ts`), with no build step.
