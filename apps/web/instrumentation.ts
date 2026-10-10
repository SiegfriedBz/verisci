import { createAgentsEnv } from "@verisci/agents";
import type { RuntimeEnv } from "@verisci/env";

/**
 * Runs once when a Next.js server starts, before it answers any request, and not during
 * `next build`. A deployed server checks its workflows' settings here, so a bad one stops it
 * at start (ADR 0004, ADR 0005).
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME === "nodejs") checkWorkflowSettings(process.env);
}

/**
 * Validates the workflows' settings unless `APP_ENV` is `local` (or unset), so `pnpm dev`
 * and CI's build need none of them; throws `EnvError` naming each bad one, never its value.
 */
export function checkWorkflowSettings(runtimeEnv: RuntimeEnv): void {
  if ((runtimeEnv.APP_ENV ?? "local") === "local") return;
  createAgentsEnv(runtimeEnv);
}
