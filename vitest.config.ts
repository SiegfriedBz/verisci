import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["apps/web", "packages/*", "infra/*"],
    passWithNoTests: true,
    // Coverage is process-wide in Vitest 5 (not allowed in project configs),
    // so per-workspace thresholds are path globs.
    coverage: {
      provider: "v8",
      // Only files imported by tests count for now: the placeholder exports have
      // no tests yet. Once every workspace has real code and tests, add
      // `include: ["apps/web/app/**", "packages/*/src/**"]` so untested files count too.
      thresholds: {
        "packages/core/**": { branches: 90 },
        "packages/{env,dkg,contracts,agents}/**": { lines: 70 },
        "apps/web/**": { lines: 70 },
        "infra/**": { lines: 70 },
      },
    },
  },
});
