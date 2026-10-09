# 0004. Env variables are declared per workspace, in one root file

- Status: Accepted
- Date: 2026-10-02

## Context

Every adapter needs configuration (URLs, keys, wallets). One central schema would make every workspace require every variable, secrets included, and a missing variable would surface late, deep in a request.

Foundry needs a few values of its own to deploy, such as an RPC URL and a block-explorer key. Forge reads them from the shell or from a `.env` file next to `foundry.toml`, and fails when one it uses is missing. No TypeScript reads them, so a `src/env.ts` would declare values that nothing in TypeScript uses. A deploy also takes choices that differ from one run to the next, such as which environment to deploy.

Programs that run on the DKG node server, such as its RPC proxy, run alone there with plain Node: using `@verisci/env` would mean installing the repo's tools on the server for a handful of settings.

## Decision

- Each workspace of the app and its packages declares only the variables it reads, in its own `src/env.ts`, with `defineEnv` from `@verisci/env` over the shared `NODE_ENV`/`APP_ENV` base. Envs passed to `extends` keep the values they were built with.
- Validation fails fast on import, with one `EnvError` naming every bad variable and never carrying a value.
- `NODE_ENV` belongs to the tools. `APP_ENV` defaults to `local`, but is required in production builds, so a host that forgets it fails instead of running as `local`.
- The app's env files live at the repo root, loaded by `apps/web/next.config.ts`. CI builds with `APP_ENV=local`.
- Forge reads the same root env file as the app. Settings it needs for every deploy, such as the RPC URL and the block-explorer key, are listed in `.env.example` in their own section, with no `src/env.ts`; forge checks them when it uses them. Choices made per deploy, such as the environment, are passed on the deploy command, so each deploy names them.
- Programs that run on the DKG node server read their settings themselves, from an env file on that server, so they run with plain Node and no install; they still fail at start-up on a bad setting, without showing its value, and each lists its variables in its README.
- `SKIP_ENV_VALIDATION` is needed by nothing today, and is never used for `next build` (it would prerender `undefined`) or in a running app.

## Consequences

- A workspace's env object exposes only what it declares, and a bad config fails at startup with a clear message. This is hygiene, not isolation: every module in a deployment shares one `process.env`, so a secret set on a host is readable by all the code it runs. Forge sees every value in the root file, secrets included, as every module of a deployment does.
- One place to fill in values, for the app and for deploys. A forge setting is checked only when a deploy uses it.
- Each plan that reads a new variable adds it to its workspace's `src/env.ts` and to `.env.example`; a program on the DKG node server lists it in its README instead.
- Usage is documented in the [`@verisci/env` README](../../packages/env/README.md).

## History

- 2026-10-05: forge reads the root env file, its deploy settings are listed in `.env.example`, and per-deploy choices go on the command, so developers keep one file of values for the app and for deploys (was ADR 0029).
- 2026-10-07: ADR 0029 folded into this one, so the env rules read in one file.
- 2026-10-07: retitled to name everything it now covers (was "Each workspace declares its own env variables").
- 2026-10-08: programs that run on the DKG node server read their settings themselves, since the server runs them with plain Node and no install (the RPC proxy).
- 2026-10-09: changed the rule's scope so it reads as one decision: `src/env.ts`, the root env file and `.env.example` cover the app and its packages; programs on the DKG node server keep their settings in an env file there, listed in their README.
