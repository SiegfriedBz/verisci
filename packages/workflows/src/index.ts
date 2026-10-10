/** Package name, imported by the web app's package test (`apps/web/app/packages.test.ts`). */
export const workflowsName = "@verisci/workflows";

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
export { createWorkflowsEnv, type WorkflowsEnv } from "./workflows-env.ts";
