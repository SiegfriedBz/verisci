import { describe, expect, it } from "vitest";
import { ratingControllerDeployments } from "./committed-deployments.ts";
import { NoDeploymentError } from "./deployments.ts";

describe("ratingControllerDeployments", () => {
  it("reads the committed file, which has no deployment yet", () => {
    expect(() => ratingControllerDeployments("staging")).toThrow(NoDeploymentError);
  });
});
