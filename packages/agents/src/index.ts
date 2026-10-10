/** Package name, listed on the web app's home page. */
export const agentsName = "@verisci/agents";

export { type AgentsEnv, createAgentsEnv } from "./agents-env.ts";
export { functions, publishPaper } from "./functions.ts";
export { inngest } from "./inngest.ts";
export type { UploadUrlResult } from "./pinata.ts";
export {
  PAPER_SUBMITTED,
  type PaperRefusal,
  PUBLISH_SETTINGS,
  type PublishFailure,
  type PublishOutcome,
  publishFailureReason,
} from "./publish/publish-paper.ts";
export type {
  SubmitLimiter,
  SubmitRefusal,
  SubmitResult,
} from "./publish/submit-paper.ts";
export type { SubmissionRefusal } from "./publish/verify-submission.ts";
export type { ReadRunResult, RunState } from "./runs.ts";
export {
  getUploadService,
  type PaperStatus,
  type PublishedRecord,
  UPLOAD_SETTINGS,
  type UploadService,
} from "./upload.ts";
