import { createSharedEnv, defineEnv, type RuntimeEnv } from "@labstrail/env";
import { z } from "zod";

/**
 * Validates the web app's own settings from `runtimeEnv` (default `process.env`): Upstash,
 * which keeps the upload limits (ADR 0035), and the Reown project id the wallet window
 * needs (ADR 0034). All three are required unless `APP_ENV` is `local`, where the limits
 * count in memory. Locally it also reads Anvil's URL and the RatingController deployed
 * there, so the rating pages request on Anvil (ADR 0036); both are optional, and ignored
 * elsewhere. The project id is read on the server and handed to the page, so no value is
 * inlined at build time. It reads the addresses Vercel sets on a deployment, production's
 * domain and the branch's URL, for the site's own links (`lib/seo/site-metadata.ts`). Throws
 * one `EnvError` naming every bad variable, never its value.
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
      LOCAL_CHAIN_RPC_URL: local ? z.url().optional() : z.string().optional(),
      LOCAL_RATING_CONTRACT: local
        ? z
            .string()
            .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x address")
            .optional()
        : z.string().optional(),
      VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
      VERCEL_BRANCH_URL: z.string().optional(),
    },
    runtimeEnv,
  });
}

/** The web app's validated settings, the shared ones included. */
export type WebEnv = ReturnType<typeof createWebEnv>;
