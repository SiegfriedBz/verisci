# verisci

pnpm + Turborepo monorepo: a Next.js 16 app (`apps/web`) and five internal packages
(`packages/{env,core,dkg,contracts,agents}`). TypeScript 6, strict. Packages ship source
(`exports` → `./src/index.ts`), no build step; Next compiles them via `transpilePackages`.

Read `README.md` for setup and commands, and `CONTRIBUTING.md` for branches, commits, docs
rules, PRs and releases. Each workspace has its own `CLAUDE.md` and `README.md`.

## Commands

| Command | Use |
| --- | --- |
| `pnpm check` / `pnpm check:fix` | Biome + `forge fmt --check` + NatSpec |
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
  env, dkg, contracts; web → all five. Import only workspaces declared in `package.json`.
- **core does no IO**: no `fetch`, no `node:*`, no `@verisci/*`. IO lives in adapter
  packages. Biome enforces this in `packages/core/biome.json`.
- Pin every dependency exactly (`pnpm add -E`). No ESLint or Prettier: Biome does both.
- Coverage thresholds live in the root `vitest.config.ts` (path globs); Vitest 5 forbids
  coverage settings in project configs.
- Solidity: solc 0.8.37, forge-std via Soldeer (never `forge install`, never git
  submodules), full NatSpec on every contract, function, event and error.

## Workflow

1. `/plan-feature <name>` writes `docs/plans/NNN-<name>.md` (gitignored local notes).
2. `/implement <NNN>` branches from `origin/develop`, writes the tests first and shows them
   failing, then implements until green, committing in small steps.
3. `/review-branch` runs the read-only reviewer, blocks on stale docs, then drafts the PR.

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
  (`.ts`/`.tsx` only); or `forge fmt`, NatSpec and `forge test` (Solidity). Fix what they
  report in the same turn.
- Before an edit: generated files (lockfiles, `next-env.d.ts`, Foundry output, Soldeer
  dependencies, deployments) are refused with how to regenerate them.
- Env files other than `.env.example` can't be read, grepped or edited; ask the user.
- On stop: workspaces changed on the branch must typecheck, or the stop is blocked with
  the errors. After 3 blocks in a row you may stop: report the remaining errors instead.
