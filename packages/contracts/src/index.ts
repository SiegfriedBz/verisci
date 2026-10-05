/** Package name, listed on the web app's home page. */
export const contractsName = "@verisci/contracts";

export { ratingControllerDeployments } from "./committed-deployments.ts";
export {
  type DeployEnv,
  type Deployment,
  NoDeploymentError,
  type RatingControllerDeployments,
} from "./deployments.ts";
export { ratingControllerAbi } from "./generated/rating-controller-abi.ts";
