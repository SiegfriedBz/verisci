import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["apps/web", "packages/*", "infra/*"],
    passWithNoTests: true,
    // Coverage is process-wide in Vitest 5 (not allowed in project configs),
    // so per-workspace thresholds are path globs.
    coverage: {
      provider: "v8",
      // Only files imported by tests count: the web app's pages and most of its
      // components are left to end-to-end tests (Playwright, a later plan), so counting
      // every file would hold them to unit-test coverage. Once those tests run, add
      // `include: ["apps/web/{app,lib,components}/**", "packages/*/src/**", "infra/*/src/**"]`
      // so untested files count too.
      thresholds: {
        "packages/core/**": { branches: 90 },
        "packages/{env,dkg,contracts,agents}/**": { lines: 70 },
        "apps/web/**": { lines: 70 },
        "infra/**": { lines: 70 },
      },
    },
  },
});
