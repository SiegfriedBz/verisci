# verisci

pnpm + Turborepo monorepo: a Next.js 16 app (`apps/web`), five internal packages
(`packages/{env,core,dkg,contracts,agents}`) and the DKG node server's RPC proxy
(`infra/rpc-proxy`, run with plain Node, imported by nothing). TypeScript 6, strict.
Packages ship source (`exports` → `./src/index.ts`), no build step; Next compiles them via
`transpilePackages`.

Read `README.md` for setup and commands, and `CONTRIBUTING.md` for branches, commits, docs
rules, PRs and releases. Each workspace has its own `CLAUDE.md` and `README.md`.

## Commands

| Command | Use |
| --- | --- |
| `pnpm check` | Biome + `forge fmt --check` + `forge lint` + NatSpec |
| `pnpm check:fix` | Biome rewrites what it can fix safely |
| `pnpm typecheck` | `tsc` in every workspace (Turbo, cached) |
| `pnpm test` | Vitest per workspace + `forge test` |
| `pnpm test:coverage` | Root Vitest run with thresholds (core ≥ 90% branches, others ≥ 70% lines) |
| `pnpm vitest related <file> --run` | Tests touching one file |
| `pnpm --filter @verisci/<ws> <script>` | One workspace |

Toolchain: Node 24.21.0 (`.nvmrc`), pnpm 10.34.6 via Corepack, Foundry 1.8.4. If `pnpm` or
`node` fails with a proto "missing_tool" error, tell the user to run
`proto install node 24.21.0 && proto install pnpm 10.34.6`; do not work around it.

## Architecture rules

- Dependency direction: env, core → nothing; dkg, contracts → core, env; agents → core,
  env, dkg, contracts; web → all five; `infra/rpc-proxy` → nothing. Import only
  workspaces declared in `package.json`.
- **core does no IO**: no `fetch`, no `node:*`, no `@verisci/*`. IO lives in adapter
  packages. Biome enforces this in `packages/core/biome.json`.
- Relative imports keep the `.ts` extension (`./shared.ts`); `allowImportingTsExtensions`
  is on in `tsconfig.base.json` because nothing emits. Scripts run packages' source with
  plain Node, so `erasableSyntaxOnly` (also in `tsconfig.base.json`) refuses syntax Node
  cannot strip, such as `enum` (ADR 0002).
- Environment variables: each workspace declares what it reads in its env module
  (`src/env.ts`; `lib/web-env.ts` in `apps/web`) with `defineEnv` from `@verisci/env`, and adds it to `.env.example` in the same PR
  (a dev script in `scripts/` declares the variables only it reads in the script). Programs
  that run on the DKG node server (`infra/*`) read their own settings instead, listed in
  their README (ADR 0004). Forge's
  deploy settings go in `.env.example`'s Foundry section instead; per-deploy choices such
  as `DEPLOY_ENV` go on the deploy command (ADR 0004).
- Pin every dependency exactly (`pnpm add -E`). No ESLint or Prettier: Biome does both.
- Coverage thresholds live in the root `vitest.config.ts` (path globs); Vitest 5 forbids
  coverage settings in project configs.
- Solidity: solc 0.8.37, forge-std via Soldeer (never `forge install`, never git
  submodules), full NatSpec on every contract, function, event and error.

## Decisions and facts

Read [`docs/adr/README.md`](docs/adr/README.md) (decisions already taken) and
[`docs/domain.md`](docs/domain.md) (DKG, chain, Inngest, Vercel, tooling facts) before
planning; cite them rather than re-arguing them.

## Workflow

1. `/plan-feature <name>` writes `docs/plans/NNN-<name>.md` (gitignored local notes).
2. `/implement <NNN>` branches from `origin/develop`, writes the tests first and shows them
   failing, then implements until green, committing in small steps.
3. `/review-branch` runs CI's checks, tests and builds, then the read-only reviewer; it
   blocks on any failure, stale docs or ADR conflict, then drafts the PR.
4. `/review-adrs`, on demand: checks every ADR against every other and reports conflicts
   for the user to decide (ADR 0025).

Branches: `<type>/<NNN>-<slug>` from `develop`. Feature PRs target `develop` and are
squash-merged; releases go `develop` → `main` with a merge commit.

## Git

- Commit messages: `type(scope): summary` (imperative, lowercase, no full stop, ≤ 72
  characters); the body says why and wraps at 72. Scope is the workspace, or `repo`, `ci`,
  `claude`, `docs`. The settings add the `Co-Authored-By` trailer.
- `git commit` asks first. Never push, never force-push, never rewrite pushed history:
  the user pushes and opens PRs.
- PR titles and descriptions are full width: one line per paragraph or bullet.

## Docs ship with the code

Before calling a branch ready, update everything the diff made false or incomplete: the
workspace README, the root README (it links to workspace READMEs rather than repeating
them), comments, TSDoc on every export, NatSpec on every contract. `/review-branch` refuses
to draft a PR while docs findings remain.

## Hooks (.claude/hooks)

- After each edit: Biome `check --write` (TS, JS, JSON, CSS), then related Vitest tests
  (`.ts`/`.tsx` only); or `forge fmt`, NatSpec, `forge lint` and `forge test` (Solidity).
  Fix what they report in the same turn.
- Before an edit: generated files (lockfiles, `next-env.d.ts`, Foundry output, Soldeer
  dependencies, deployments) are refused with how to regenerate them.
- Env files other than `.env.example` are blocked for the Read, Grep and Edit tools and for
  `cat`, `less`, `head`, `tail` and `grep` in the shell. Never read them any other way;
  ask the user.
- On stop: workspaces changed on the branch, and the workspaces depending on them (all of
  them after a root config change), must typecheck, or the stop is blocked with the errors. After 3 blocks in a row you may stop: report the remaining errors instead.
