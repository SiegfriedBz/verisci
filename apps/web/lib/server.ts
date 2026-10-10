import { createLimits } from "./limits.ts";
import { createWebEnv } from "./web-env.ts";

let limits: ReturnType<typeof createLimits> | undefined;

/** The upload limits, built on first use from the web app's settings (Upstash, or memory locally). */
export function getLimits(): ReturnType<typeof createLimits> {
  if (limits) return limits;
  const env = createWebEnv();
  limits = createLimits({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  return limits;
}
