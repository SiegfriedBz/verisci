import { BASE_SEPOLIA_CHAIN_ID } from "@verisci/core";
import { describe, expect, it } from "vitest";
import committed from "../deployments/base-sepolia.json" with { type: "json" };
import { ratingControllerDeployments } from "./committed-deployments.ts";
import { type DeployEnv, NoDeploymentError } from "./deployments.ts";

const environments: DeployEnv[] = ["staging", "production"];

describe("ratingControllerDeployments", () => {
  it.each(environments)("returns %s's recorded deployments, or throws when it has none", (env) => {
    const recorded = committed[env];
    if (recorded.current === null) {
      expect(() => ratingControllerDeployments(env)).toThrow(NoDeploymentError);
      return;
    }
    expect(ratingControllerDeployments(env)).toEqual({
      chainId: BASE_SEPOLIA_CHAIN_ID,
      current: recorded.current,
      past: recorded.past,
    });
  });

  it("resolves local to staging", () => {
    const staging =
      committed.staging.current === null ? null : ratingControllerDeployments("staging");
    if (staging === null) {
      expect(() => ratingControllerDeployments("local")).toThrow(NoDeploymentError);
      return;
    }
    expect(ratingControllerDeployments("local")).toEqual(staging);
  });
});
