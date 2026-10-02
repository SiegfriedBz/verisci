# verisci

A pnpm and Turborepo monorepo: a Next.js app and five internal packages.
Packages ship TypeScript source, with no build step; Next.js compiles them
through `transpilePackages`.

## Requirements

- Node 24 (see `.nvmrc`). `pnpm install` refuses any other major version.
- Corepack, which provides the pnpm version pinned in `packageManager`.

## Getting started

```sh
corepack enable
pnpm install
pnpm typecheck   # every workspace
pnpm build       # builds apps/web
pnpm dev         # starts apps/web on http://localhost:3000
```

Root scripts run through Turbo, which caches results by input.

## Workspaces

| Workspace | What it is | Depends on |
| --- | --- | --- |
| [`apps/web`](apps/web/README.md) | Next.js app | all five packages |
| [`packages/env`](packages/env/README.md) | Typed environment variables | none |
| [`packages/core`](packages/core/README.md) | Domain logic, no IO | none |
| [`packages/dkg`](packages/dkg/README.md) | DKG adapter | core, env |
| [`packages/contracts`](packages/contracts/README.md) | Solidity contracts and their TypeScript side | core, env |
| [`packages/agents`](packages/agents/README.md) | Agents | core, env, dkg, contracts |

Each workspace may only import the workspaces it declares. pnpm does not
hoist undeclared workspace packages, so breaking this rule fails `pnpm
typecheck`.

## Environments

`develop` is staging (testnets) and `main` is production. Feature
PRs target `develop`; release PRs move `develop` into `main`. Details are in
[CONTRIBUTING.md](CONTRIBUTING.md#environments).

## Contributing

Branches, commits, docs rules, pull requests and releases are covered in
[CONTRIBUTING.md](CONTRIBUTING.md). verisci is built with
[Claude Code](https://claude.com/claude-code).

## License

[MIT](LICENSE)
