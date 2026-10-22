import type { RuntimeEnv } from "@labstrail/env";

/**
 * Runs once when a Next.js server starts, before it answers any request, and not during
 * `next build`. A deployed server checks the workflows', the web app's and, where the rating
 * functions run, the rating settings here, so a bad one stops it at start (ADRs 0004, 0005,
 * 0019). They are imported only on the Node.js runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkRatingSettings, createWorkflowsEnv } = await import("@labstrail/workflows");
  const { createWebEnv } = await import("./lib/web-env.ts");
  checkServerSettings(process.env, [createWorkflowsEnv, createWebEnv, checkRatingSettings]);
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
