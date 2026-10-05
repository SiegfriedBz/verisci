# packages/env

Typed, validated environment variables for every other workspace. See `README.md` here.

- Depends on no other workspace.
- Only `sharedSchema` lives here. A workspace's own variables go in its `src/env.ts`
  through `defineEnv`, in the PR that first reads them, and in the root `.env.example`.
  Variables read only by forge are listed in `.env.example`'s Foundry section (ADR 0029).
- `EnvError` must never carry a value: the secret test in `define-env.test.ts` guards it.
- Tests pass `runtimeEnv` explicitly; never set `process.env` in a test.
- Never read real env files: variable names and examples live in `.env.example`.
