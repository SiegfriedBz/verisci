# packages/env

Typed, validated environment variables for every other workspace. See `README.md` here.

- Depends on no other workspace.
- Only `sharedSchema` lives here. A workspace's own variables go in its env module
  (`src/env.ts`, which may import its schema from a file next to it; `lib/web-env.ts` in
  `apps/web`) through `defineEnv`, in the PR that first reads them, and in the root
  `.env.example`.
  A dev script in `scripts/` declares the variables only it reads in the script.
  Forge's deploy settings are listed in `.env.example`'s Foundry section; per-deploy
  choices such as `DEPLOY_ENV` go on the deploy command (ADR 0004).
  Programs on the DKG node server (`infra/*`) read their own settings (ADR 0004).
- `EnvError` must never carry a value: the secret test in `define-env.test.ts` guards it.
- Tests pass `runtimeEnv` explicitly; never set `process.env` in a test.
- Never read real env files: variable names and examples live in `.env.example`.
