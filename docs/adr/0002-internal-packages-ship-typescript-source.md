# 0002. Internal packages ship TypeScript source

- Status: Accepted
- Date: 2026-10-02

## Context

Internal packages are consumed only inside this monorepo. A build step per package means `dist/` folders, watch builds and stale output.

## Decision

Internal packages export `src/*.ts` with no build step. Next.js compiles them via `transpilePackages`; a script or command-line tool in the repo runs them with plain Node's type stripping, with no TypeScript runner. Programs that run on the DKG node server (`infra/*`) also ship their `.ts` source, run the same way; the app imports none of them. So every package and program uses only syntax Node can strip. Relative imports keep the `.ts` extension (`allowImportingTsExtensions` in `tsconfig.base.json`, safe because nothing emits).

## Consequences

- Nothing to build or keep in sync; a change in a package is live in `web` at once.
- Every package the app imports must be listed in `apps/web/next.config.ts` `transpilePackages`.
- Publishing a package outside the repo would need a build step then.
- Syntax Node cannot strip is out of every package, since a script may run it ([domain](../domain.md) → Tooling).

## History

- 2026-10-09: changed to cover the programs on the DKG node server (`infra/*`), which also ship `.ts` source and run under plain Node's type stripping, and to limit `transpilePackages` to the packages the app imports.
- 2026-10-10: scripts and command-line tools run packages' source with plain Node's type stripping instead of a TypeScript runner, as the contracts tools and the agents' `publish-pdf` already do, so every package uses only syntax Node can strip.
- 2026-10-10: corrected: the list of syntax Node cannot strip moved to `docs/domain.md`, a fact rather than the decision (ADR sweep).
