import { createSharedEnv, defineEnv, type RuntimeEnv } from "@verisci/env";
import { z } from "zod";

/** A full context graph id: the agent address, a `/`, then the graph's name. */
const GRAPH_ID = /^0x[0-9a-fA-F]{40}\/[^/\s]+$/;

/**
 * Validates the DKG node's settings from `runtimeEnv` (default `process.env`); throws
 * `EnvError` naming every bad variable, never its value. `@verisci/dkg/env` builds it once
 * from `process.env`; tests and scripts call this with their own object.
 *
 * `DKG_CONTEXT_GRAPH` must be a full id (a bare name reads another, empty graph), and is a
 * `-prod` graph exactly when `APP_ENV` is `production` (ADR 0005).
 */
export function createDkgEnv(runtimeEnv: RuntimeEnv = process.env) {
  const shared = createSharedEnv(runtimeEnv);

  return defineEnv({
    extends: [shared],
    server: dkgSchema(shared.APP_ENV === "production"),
    runtimeEnv,
  });
}

/**
 * The DKG node's variables and their rules, for a workspace that validates them with its own
 * in one `defineEnv`, so one `EnvError` names every bad variable.
 */
export function dkgSchema(isProduction: boolean) {
  return {
    DKG_URL: z.url(),
    DKG_TOKEN: z.string().min(1),
    DKG_CONTEXT_GRAPH: contextGraphSchema(isProduction),
  };
}

/**
 * The rule for `DKG_CONTEXT_GRAPH`: a full id, `<agent address>/<graph name>`, that is a
 * `-prod` graph exactly when `isProduction` (ADR 0005). Shared with scripts that read the
 * variable without the rest of the DKG settings.
 */
export function contextGraphSchema(isProduction: boolean) {
  return z
    .string()
    .regex(GRAPH_ID, "must be the full id, <agent address>/<graph name>")
    .refine(
      (id) => id.endsWith("-prod") === isProduction,
      isProduction
        ? "must be a -prod graph when APP_ENV is production"
        : "a -prod graph needs APP_ENV=production",
    );
}

/** The validated DKG settings: `DKG_URL`, `DKG_TOKEN`, `DKG_CONTEXT_GRAPH`, plus the shared ones. */
export type DkgEnv = ReturnType<typeof createDkgEnv>;
