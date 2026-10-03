import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// The repo keeps its env files at the root (.env.local and friends), but Next.js
// only looks in apps/web. Reload from the root instead: forceReload because Next
// has already loaded (and cached) apps/web by now. Variables already in the
// environment win, so CI and hosts are unaffected. Next only watches apps/web,
// so edits to the root files need a dev server restart.
loadEnvConfig(
  fileURLToPath(new URL("../..", import.meta.url)),
  process.env.NODE_ENV !== "production",
  console,
  true,
);

const nextConfig: NextConfig = {
  transpilePackages: [
    "@verisci/agents",
    "@verisci/contracts",
    "@verisci/core",
    "@verisci/dkg",
    "@verisci/env",
  ],
};

export default nextConfig;
