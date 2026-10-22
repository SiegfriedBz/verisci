import { createWorkflowsEnv, type WorkflowsEnv } from "./workflows-env.ts";

export {
  checkRatingSettings,
  createRatingEnv,
  localChainSchema,
  type RatingEnv,
} from "./rating-env.ts";
export { createWorkflowsEnv, type WorkflowsEnv } from "./workflows-env.ts";

/**
 * The workflows' settings, validated from `process.env` on first import (ADR 0004). Exported
 * as `@labstrail/workflows/env`, apart from the main entry, so serving the functions never
 * requires them. The rating functions' settings, declared in `rating-env.ts`, are validated
 * by `createRatingEnv` where those functions run: only a deployment with the oracle key needs
 * them (ADR 0019).
 */
export const env: WorkflowsEnv = createWorkflowsEnv();
