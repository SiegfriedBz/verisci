# verisci

A pnpm and Turborepo monorepo: a Next.js app in `apps/web` and the
`@verisci/*` packages in `packages/` (`env`, `core`, `dkg`, `contracts`,
`agents`). Packages ship TypeScript source, with no build step.

## Requirements

- Node 24 (see `.nvmrc`)
- Corepack, which provides the pnpm version pinned in `packageManager`

## Commands

```sh
corepack enable
pnpm install
pnpm typecheck
pnpm build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commits and pull requests.
