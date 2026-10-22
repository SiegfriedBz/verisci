import { createSharedEnv, defineEnv, type RuntimeEnv } from "@labstrail/env";
import { getAddress } from "viem";
import { z } from "zod";

/** A full context graph id: the agent address, a `/`, then the graph's name. */
const GRAPH_ID = /^0x[0-9a-fA-F]{40}\/[^/\s]+$/;

/**
 * Whether a full context graph id's address is in EIP-55 checksum case, the spelling the DKG
 * node lists it in: in another case, queries read another, empty graph (`docs/domain.md` →
 * DKG). An id that is not a full one passes here: `GRAPH_ID`'s rule names it.
 */
function checksummed(contextGraph: string): boolean {
  if (!GRAPH_ID.test(contextGraph)) return true;
  const address = contextGraph.split("/")[0] ?? "";
  try {
    return getAddress(address) === address;
  } catch {
    return false;
  }
}

/**
 * Validates the DKG node's settings from `runtimeEnv` (default `process.env`); throws
 * `EnvError` naming every bad variable, never its value. `@labstrail/dkg/env` builds it once
 * from `process.env`; tests and scripts call this with their own object.
 *
 * `DKG_CONTEXT_GRAPH` must be a full id (a bare name reads another, empty graph) with its
 * address in the node's EIP-55 checksum case, and is a `-prod` graph exactly when `APP_ENV`
 * is `production` (ADR 0005).
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
 * The rule for `DKG_CONTEXT_GRAPH`: a full id, `<agent address>/<graph name>`, with the
 * address in EIP-55 checksum case as the node lists it, that is a `-prod` graph exactly when
 * `isProduction` (ADR 0005). Shared with scripts that read the variable without the rest of
 * the DKG settings.
 */
export function contextGraphSchema(isProduction: boolean) {
  return z
    .string()
    .regex(GRAPH_ID, "must be the full id, <agent address>/<graph name>")
    .refine(checksummed, "must spell its address as the DKG node lists it, in EIP-55 checksum case")
    .refine(
      (id) => id.endsWith("-prod") === isProduction,
      isProduction
        ? "must be a -prod graph when APP_ENV is production"
        : "a -prod graph needs APP_ENV=production",
    );
}

/** The validated DKG settings: `DKG_URL`, `DKG_TOKEN`, `DKG_CONTEXT_GRAPH`, plus the shared ones. */
export type DkgEnv = ReturnType<typeof createDkgEnv>;
