import { type AgentsEnv, createAgentsEnv } from "./agents-env.ts";

export { type AgentsEnv, createAgentsEnv } from "./agents-env.ts";

/**
 * The agents' settings, validated from `process.env` on first import (ADR 0004). Exported
 * as `@verisci/agents/env`, apart from the main entry, so serving the functions never
 * requires them.
 */
export const env: AgentsEnv = createAgentsEnv();
