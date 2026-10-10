import type { RuntimeEnv } from "@verisci/env";

/**
 * Runs once when a Next.js server starts, before it answers any request, and not during
 * `next build`. A deployed server checks its workflows' settings here, so a bad one stops it
 * at start (ADR 0004, ADR 0005). The agents are imported only on the Node.js runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { createAgentsEnv } = await import("@verisci/agents");
  checkWorkflowSettings(process.env, createAgentsEnv);
}

/**
 * Validates the workflows' settings with `createEnv` unless `APP_ENV` is `local` (or unset),
 * so `pnpm dev` and CI's build need none of them; `createEnv` throws `EnvError` naming each
 * bad one, never its value.
 */
export function checkWorkflowSettings(
  runtimeEnv: RuntimeEnv,
  createEnv: (runtimeEnv: RuntimeEnv) => unknown,
): void {
  if ((runtimeEnv.APP_ENV ?? "local") === "local") return;
  createEnv(runtimeEnv);
}
