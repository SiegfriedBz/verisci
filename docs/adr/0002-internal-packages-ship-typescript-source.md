# 0002. Internal packages ship TypeScript source

- Status: Accepted
- Date: 2026-10-02

## Context

Internal packages are consumed only inside this monorepo. A build step per package means `dist/` folders, watch builds and stale output.

## Decision

Internal packages export `src/*.ts` with no build step. Next.js compiles them via `transpilePackages`, and scripts run them via `tsx`. Relative imports keep the `.ts` extension (`allowImportingTsExtensions` in `tsconfig.base.json`, safe because nothing emits).

## Consequences

- Nothing to build or keep in sync; a change in a package is live in `web` at once.
- Every package must be listed in `apps/web/next.config.ts` `transpilePackages`.
- Publishing a package outside the repo would need a build step then.
