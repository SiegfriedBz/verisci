import type { NextConfig } from "next";

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
