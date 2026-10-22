import { readFileSync } from "node:fs";
import { contractsName } from "@labstrail/contracts";
import { coreName } from "@labstrail/core";
import { dkgName } from "@labstrail/dkg";
import { workflowsName } from "@labstrail/workflows";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("workspace packages", () => {
  it("each resolves from the web app", () => {
    expect([contractsName, coreName, dkgName, workflowsName]).toEqual([
      "@labstrail/contracts",
      "@labstrail/core",
      "@labstrail/dkg",
      "@labstrail/workflows",
    ]);
  });

  it("are all listed in transpilePackages, or next build cannot compile them", () => {
    const { dependencies } = JSON.parse(read("../package.json")) as {
      dependencies: Record<string, string>;
    };
    const config = read("../next.config.ts");
    const workspaces = Object.keys(dependencies).filter((name) => name.startsWith("@labstrail/"));

    expect(workspaces).toHaveLength(5);
    for (const name of workspaces) expect(config).toContain(`"${name}"`);
  });

  it("include a core with no side effects, so a page using one helper carries none of its schemas", () => {
    const core = JSON.parse(read("../../../packages/core/package.json")) as {
      sideEffects?: boolean;
    };

    expect(core.sideEffects).toBe(false);
  });
});
