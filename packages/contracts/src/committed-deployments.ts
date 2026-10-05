import committed from "../deployments/base-sepolia.json" with { type: "json" };
import {
  type DeployEnv,
  parseDeployments,
  type RatingControllerDeployments,
  resolveDeployments,
} from "./deployments.ts";

const deployments = parseDeployments(committed);

/**
 * The RatingController deployments of an environment, from the committed deployments file
 * (ADR 0028): the current one, which takes new requests, and past ones, which are paused.
 * @throws NoDeploymentError when that environment has no current deployment.
 */
export function ratingControllerDeployments(
  appEnv: DeployEnv | "local",
): RatingControllerDeployments {
  return resolveDeployments(deployments, appEnv);
}
