/** Package name, listed on the web app's home page. */
export const agentsName = "@verisci/agents";

export { functions, publishPaper } from "./functions.ts";
export { inngest } from "./inngest.ts";
export {
  PAPER_SUBMITTED,
  type PaperRefusal,
  PUBLISH_SETTINGS,
  type PublishOutcome,
} from "./publish/publish-paper.ts";
export type { SubmissionRefusal } from "./publish/verify-submission.ts";
