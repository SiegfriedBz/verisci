import { readFileSync } from "node:fs";
import { agentsName } from "@verisci/agents";
import { contractsName } from "@verisci/contracts";
import { coreName } from "@verisci/core";
import { dkgName } from "@verisci/dkg";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("workspace packages", () => {
  it("each resolves from the web app", () => {
    expect([agentsName, contractsName, coreName, dkgName]).toEqual([
      "@verisci/agents",
      "@verisci/contracts",
      "@verisci/core",
      "@verisci/dkg",
    ]);
  });

  it("are all listed in transpilePackages, or next build cannot compile them", () => {
    const { dependencies } = JSON.parse(read("../package.json")) as {
      dependencies: Record<string, string>;
    };
    const config = read("../next.config.ts");
    const workspaces = Object.keys(dependencies).filter((name) => name.startsWith("@verisci/"));

    expect(workspaces).toHaveLength(5);
    for (const name of workspaces) expect(config).toContain(`"${name}"`);
  });
});
