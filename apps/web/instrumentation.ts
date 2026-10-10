import type { RuntimeEnv } from "@verisci/env";

/**
 * Runs once when a Next.js server starts, before it answers any request, and not during
 * `next build`. A deployed server checks the workflows' and the web app's settings here, so
 * a bad one stops it at start (ADR 0004, ADR 0005). Both are imported only on the Node.js
 * runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { createWorkflowsEnv } = await import("@verisci/workflows");
  const { createWebEnv } = await import("./lib/web-env.ts");
  checkServerSettings(process.env, [createWorkflowsEnv, createWebEnv]);
}

/**
 * Validates `runtimeEnv` with each of `checks` unless `APP_ENV` is `local` (or unset), so
 * `pnpm dev` and CI's build need none of them; a check throws `EnvError` naming each bad
 * setting, never its value, and the first to throw stops the start.
 */
export function checkServerSettings(
  runtimeEnv: RuntimeEnv,
  checks: readonly ((runtimeEnv: RuntimeEnv) => unknown)[],
): void {
  if ((runtimeEnv.APP_ENV ?? "local") === "local") return;
  for (const check of checks) check(runtimeEnv);
}
