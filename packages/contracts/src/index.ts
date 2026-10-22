/** Package name, imported by the web app's package test (`apps/web/app/packages.test.ts`). */
export const contractsName = "@labstrail/contracts";

export { ratingControllerDeployments } from "./committed-deployments.ts";
export {
  type DeployEnv,
  type Deployment,
  NoDeploymentError,
  type RatingControllerDeployments,
} from "./deployments.ts";
export { ratingControllerAbi } from "./generated/rating-controller-abi.ts";
export {
  type CancelReason,
  type ContractReader,
  cancelCalldata,
  fulfilCalldata,
  type RatingRequestState,
  type ReadOracleResult,
  type ReadPendingCountResult,
  type ReadRequestIdsResult,
  type ReadRequestResult,
  type RequestStatus,
  readOracleAgent,
  readPendingCount,
  readPendingRequestIds,
  readRatingRequest,
  readRequestIdsOf,
} from "./rating-controller.ts";
