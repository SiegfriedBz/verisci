import { createDkgEnv } from "@verisci/dkg";
import { defineEnv, type RuntimeEnv } from "@verisci/env";
import { z } from "zod";

/**
 * Validates the agents' settings from `runtimeEnv` (default `process.env`): GROBID, the
 * Pinata gateway and a Base Sepolia RPC URL, plus the DKG node's (`createDkgEnv`) and the
 * shared ones. Throws `EnvError` naming every bad variable, never its value.
 * `@verisci/agents/env` builds it once from `process.env`; the functions build it on their
 * first run, and tests call this with their own object.
 */
export function createAgentsEnv(runtimeEnv: RuntimeEnv = process.env) {
  return defineEnv({
    extends: [createDkgEnv(runtimeEnv)],
    server: {
      GROBID_URL: z.url(),
      PINATA_GATEWAY_URL: z.url(),
      CHAIN_RPC_URL: z.url(),
    },
    runtimeEnv,
  });
}

/** The validated agents settings, the DKG node's and the shared ones included. */
export type AgentsEnv = ReturnType<typeof createAgentsEnv>;
