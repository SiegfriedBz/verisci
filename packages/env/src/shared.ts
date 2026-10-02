import { z } from "zod";
import { defineEnv, type RuntimeEnv } from "./define-env.ts";

const nodeEnv = z.enum(["development", "test", "production"]).default("development");
const appEnv = z.enum(["local", "staging", "production"]);

/**
 * Schemas for the variables every workspace may read, given the env they will
 * validate. `NODE_ENV` is set by the tools (`next`, Vitest), never by hand.
 * `APP_ENV` is the deployment: `local` when not deployed (a dev machine or CI),
 * `staging` for `develop`, `production` for `main`. It defaults to `local`,
 * except when `NODE_ENV` is `production`: a production build must say where it
 * deploys, so a host that forgets `APP_ENV` fails instead of running as `local`.
 */
export function sharedSchema(runtimeEnv: RuntimeEnv = process.env) {
  const isProductionBuild = runtimeEnv.NODE_ENV === "production";
  return {
    NODE_ENV: nodeEnv,
    APP_ENV: isProductionBuild ? appEnv : appEnv.default("local"),
  };
}

/** The validated shared variables. */
export type SharedEnv = ReturnType<typeof createSharedEnv>;

/** Validates the shared variables from `runtimeEnv` (default `process.env`); for tests and scripts. */
export function createSharedEnv(runtimeEnv: RuntimeEnv = process.env) {
  return defineEnv({ server: sharedSchema(runtimeEnv), runtimeEnv });
}

/** The shared variables, validated from `process.env` on first import. Pass it to `extends`. */
export const sharedEnv: SharedEnv = createSharedEnv();
