# 0002. Internal packages ship TypeScript source

- Status: Accepted
- Date: 2026-10-02

## Context

Internal packages are consumed only inside this monorepo. A build step per package means `dist/` folders, watch builds and stale output.

## Decision

Internal packages export `src/*.ts` with no build step. Next.js compiles them via `transpilePackages`; anything else that runs them (a script, a command-line tool) uses a TypeScript runner such as `tsx`, added by the first plan that needs one. Programs that run on the DKG node server (`infra/*`) also ship their `.ts` source, run by plain Node's type stripping, so they use only syntax Node can strip; the app imports none of them. Relative imports keep the `.ts` extension (`allowImportingTsExtensions` in `tsconfig.base.json`, safe because nothing emits).

## Consequences

- Nothing to build or keep in sync; a change in a package is live in `web` at once.
- Every package the app imports must be listed in `apps/web/next.config.ts` `transpilePackages`.
- Publishing a package outside the repo would need a build step then.

## History

- 2026-10-09: corrected to cover the programs on the DKG node server (`infra/*`), which also ship `.ts` source and run under plain Node's type stripping, and to limit `transpilePackages` to the packages the app imports.
