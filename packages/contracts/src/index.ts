/** Package name, imported by the web app's package test (`apps/web/app/packages.test.ts`). */
export const contractsName = "@verisci/contracts";

export { ratingControllerDeployments } from "./committed-deployments.ts";
export {
  type DeployEnv,
  type Deployment,
  NoDeploymentError,
  type RatingControllerDeployments,
} from "./deployments.ts";
export { ratingControllerAbi } from "./generated/rating-controller-abi.ts";
