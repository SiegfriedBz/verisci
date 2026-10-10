import { createWorkflowsEnv, type WorkflowsEnv } from "./workflows-env.ts";

export { createWorkflowsEnv, type WorkflowsEnv } from "./workflows-env.ts";

/**
 * The workflows' settings, validated from `process.env` on first import (ADR 0004). Exported
 * as `@verisci/workflows/env`, apart from the main entry, so serving the functions never
 * requires them.
 */
export const env: WorkflowsEnv = createWorkflowsEnv();
