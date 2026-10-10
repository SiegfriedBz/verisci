import { createSharedEnv, defineEnv, type RuntimeEnv } from "@verisci/env";
import { z } from "zod";

/**
 * Validates the web app's own settings from `runtimeEnv` (default `process.env`): Upstash,
 * which keeps the upload limits (ADR 0035), and the Reown project id the wallet window
 * needs (ADR 0034). All three are required unless `APP_ENV` is `local`, where the limits
 * count in memory. The project id is read on the server and handed to the page, so no
 * value is inlined at build time. Throws one `EnvError` naming every bad variable, never
 * its value.
 */
export function createWebEnv(runtimeEnv: RuntimeEnv = process.env) {
  const shared = createSharedEnv(runtimeEnv);
  const local = shared.APP_ENV === "local";
  const text = local ? z.string().min(1).optional() : z.string().min(1);
  return defineEnv({
    extends: [shared],
    server: {
      UPSTASH_REDIS_REST_URL: local ? z.url().optional() : z.url(),
      UPSTASH_REDIS_REST_TOKEN: text,
      REOWN_PROJECT_ID: text,
    },
    runtimeEnv,
  });
}

/** The web app's validated settings, the shared ones included. */
export type WebEnv = ReturnType<typeof createWebEnv>;
