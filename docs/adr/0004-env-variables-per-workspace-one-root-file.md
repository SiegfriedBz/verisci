# 0004. Env variables are declared per workspace, in one root file

- Status: Accepted
- Date: 2026-10-02

## Context

Every adapter needs configuration (URLs, keys, wallets). One central schema would make every workspace require every variable, secrets included, and a missing variable would surface late, deep in a request.

Foundry needs a few values of its own to deploy, such as an RPC URL and a block-explorer key. Forge reads them from the shell or from a `.env` file next to `foundry.toml`, and fails when one it uses is missing. No TypeScript reads them, so an env module would declare values that nothing in TypeScript uses. A deploy also takes choices that differ from one run to the next, such as which environment to deploy.

Programs that run on the DKG node server, such as its RPC proxy, run alone there with plain Node: using `@verisci/env` would mean installing the repo's tools on the server for a handful of settings.

## Decision

- Each workspace of the app and its packages declares only the variables it reads, in its own env module, with `defineEnv` from `@verisci/env` over the shared `NODE_ENV`/`APP_ENV` base. A dev script declares the variables only it reads in the script itself, so the workspace's env module never requires a value only that script uses.
- Validation fails fast on import, with one `EnvError` naming every bad variable and never carrying a value. Workflows and the web app's own settings are the exception, since `next build` imports them with only `APP_ENV` set (`web` serves the workflows): a deployed server checks them when it starts, not when it is built, and refuses to start when one is bad; locally, a workflow checks its settings on its first run, and the web app on the request that reads them. A deployment requires only the settings it uses: a preview, which holds no oracle key ([0005](0005-staging-and-production-are-isolated.md), [0019](0019-oracle-transactions-are-serialized.md)), does not require it.
- `NODE_ENV` belongs to the tools. `APP_ENV` defaults to `local`, but is required in production builds, so a host that forgets it fails instead of running as `local`.
- The app's env files live at the repo root, loaded by `apps/web/next.config.ts`. CI builds with `APP_ENV=local`.
- Forge reads the same root env file as the app. Settings it needs for every deploy, such as the RPC URL and the block-explorer key, are listed in `.env.example` in their own section, with no env module; forge checks them when it uses them. Choices made per deploy, such as the environment, are passed on the deploy command, so each deploy names them.
- Programs that run on the DKG node server read their settings themselves, from an env file on that server, so they run with plain Node and no install; they still fail at start-up on a bad setting, without showing its value, and each lists its variables in its README.
- `SKIP_ENV_VALIDATION` is needed by nothing today, and is never used for `next build` (it would prerender `undefined`) or in a running app.

## Consequences

- A workspace's env object exposes only what it declares, and a bad config fails at startup with a clear message; a workflow's or the web app's, on a deployed server's start, or locally on its first run or request. This is hygiene, not isolation: every module in a deployment shares one `process.env`, so a secret set on a host is readable by all the code it runs. Forge sees every value in the root file, secrets included, as every module of a deployment does.
- One place to fill in values, for the app and for deploys. A forge setting is checked only when a deploy uses it.
- Each plan that reads a new variable adds it to its workspace's env module, or to the dev script that alone reads it, and to `.env.example`; a program on the DKG node server lists it in its README instead.
- Usage is documented in the [`@verisci/env` README](../../packages/env/README.md).

## History

- 2026-10-05: forge reads the root env file, its deploy settings are listed in `.env.example`, and per-deploy choices go on the command, so developers keep one file of values for the app and for deploys (was ADR 0029).
- 2026-10-07: ADR 0029 folded into this one, so the env rules read in one file.
- 2026-10-07: retitled to name everything it now covers (was "Each workspace declares its own env variables").
- 2026-10-08: programs that run on the DKG node server read their settings themselves, since the server runs them with plain Node and no install (the RPC proxy).
- 2026-10-09: changed the rule's scope so it reads as one decision: `src/env.ts`, the root env file and `.env.example` cover the app and its packages; programs on the DKG node server keep their settings in an env file there, listed in their README.
- 2026-10-09: corrected: variables are declared in a workspace's env module rather than a named file, since the dkg package keeps its schema in a function tests can call with their own values; the Foundry sentences say "env module" too (DKG client).
- 2026-10-09: corrected: dropped "Envs passed to `extends` keep the values they were built with", a mechanic of `defineEnv` already in the `@verisci/env` README, not a decision.
- 2026-10-10: a deployed server checks its workflows' settings when it starts, not on import, since `next build` imports workflows with only `APP_ENV` set, so a bad setting still fails at startup ([0005](0005-staging-and-production-are-isolated.md), [0019](0019-oracle-transactions-are-serialized.md)); locally, a workflow checks them on its first run and stops without retries (publish run).
- 2026-10-10: a dev script declares the variables only it reads in the script, so its workspace's env module never requires them (`publish-pdf` and `PINATA_JWT`).
- 2026-10-10: corrected: the Consequences name the dev-script exception too.
- 2026-10-10: a deployment requires only the settings it uses, so a preview, with no oracle key, still starts; corrected: how a workflow's run ends on a bad setting moved to the agents README (ADR sweep).
- 2026-10-10: the web app's own settings join the workflows' exception, checked at a deployed server's start rather than on import, since `next build` imports the web app with only `APP_ENV` set too (upload page).
