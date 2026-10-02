import { z } from "zod";
import { defineEnv, type RuntimeEnv } from "./define-env.ts";

/**
 * Variables every workspace may read. `APP_ENV` is set per host environment:
 * `local` on a dev machine, `staging` for `develop`, `production` for `main`.
 */
export const sharedSchema = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
};

/** The validated shared variables. */
export type SharedEnv = ReturnType<typeof createSharedEnv>;

/** Validates the shared variables from `runtimeEnv` (default `process.env`); for tests and scripts. */
export function createSharedEnv(runtimeEnv?: RuntimeEnv) {
  return defineEnv({ server: sharedSchema, runtimeEnv });
}

/** The shared variables, validated from `process.env` on first import. Pass it to `extends`. */
export const sharedEnv: SharedEnv = createSharedEnv();
