# 0001. Toolchain: Biome, TypeScript 6, Soldeer, exact pins

- Status: Accepted
- Date: 2026-10-02

## Context

The toolchain runs on every edit (Claude Code hooks) and every PR (CI), so it has to be fast and unambiguous. The previous repo used ESLint in `web` and solc 0.8.24.

## Decision

- Biome replaces ESLint and Prettier: one tool formats and lints, fast enough for every edit.
- TypeScript is pinned to 6.0.x: `next build` type-checks through TypeScript's JavaScript API, which 7.0 lacks (it returns in 7.1). Moving to 7.x is one PR once Next.js supports it.
- Foundry dependencies come through Soldeer, never git submodules, so CI needs no recursive clone.
- Every dependency is pinned exactly (`pnpm add -E`), and Solidity compiles with solc 0.8.37.

## Consequences

- One config (`biome.json`) instead of two, and no ESLint plugin ecosystem.
- Upgrading TypeScript waits on Next.js.
- Dependency upgrades are deliberate PRs, never drift.
