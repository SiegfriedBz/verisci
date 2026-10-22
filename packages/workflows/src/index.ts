/** Package name, imported by the web app's package test (`apps/web/app/packages.test.ts`). */
export const workflowsName = "@labstrail/workflows";

export { type SiteEnv, siteUrlOf } from "./alerts/messages.ts";
export {
  failureAlerts,
  functions,
  healthCheck,
  oracleTransaction,
  publishPaper,
  ratePaper,
  reconcileRatings,
  servedFunctions,
} from "./functions.ts";
export { inngest } from "./inngest.ts";
export { describeFailure } from "./publish/failure.ts";
export type { PinataUnavailable, UploadUrlResult } from "./publish/pinata.ts";
export {
  PAPER_SUBMITTED,
  type PaperRefusal,
  PUBLISH_SETTINGS,
  type PublishFailure,
  type PublishLogger,
  type PublishOutcome,
  publishFailureReason,
} from "./publish/publish-paper.ts";
export type {
  LimitAnswer,
  SubmitLimiter,
  SubmitRefusal,
  SubmitResult,
} from "./publish/submit-paper.ts";
export type { SubmissionRefusal } from "./publish/verify-submission.ts";
export {
  RATING_REQUESTED,
  type RatingRequested,
  ratingRequestedEvent,
} from "./rating/events.ts";
export {
  ORACLE_SETTINGS,
  type OracleAction,
  type OracleFailure,
  type OracleInput,
  type OracleResult,
} from "./rating/oracle.ts";
export {
  RATING_SETTINGS,
  type RatingFailure,
  type RatingOutcome,
  ratingFailureReason,
} from "./rating/rate-paper.ts";
export {
  checkRatingSettings,
  createRatingEnv,
  type RatingEnv,
  ratingSettingsRequired,
  servesRating,
} from "./rating-env.ts";
export type {
  PaperListResult,
  PaperSummary,
  QueryProblem,
  SignatureCheck,
} from "./site/papers.ts";
export {
  type AnnounceResult,
  getRatingService,
  type PaperRatingSummary,
  type RatingListResult,
  type RatingService,
  type RatingStage,
  type RatingSummary,
  type RatingView,
  summariseRatings,
} from "./site/ratings.ts";
export type { ReadRunResult, RunState } from "./site/runs.ts";
export {
  getUploadService,
  type PaperStatus,
  type PublishedRecord,
  UPLOAD_SETTINGS,
  type UploadService,
} from "./site/upload.ts";
export {
  getWebhookIntake,
  type WebhookIntake,
  type WebhookStatus,
} from "./site/webhook.ts";
export { createWorkflowsEnv, type WorkflowsEnv } from "./workflows-env.ts";
