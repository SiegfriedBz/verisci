import { dkgSchema } from "@verisci/dkg";
import { createSharedEnv, defineEnv, type RuntimeEnv } from "@verisci/env";
import { z } from "zod";

/** The Pinata API key (JWT) that signs uploads, lists and unpins files. Secret. */
export const pinataSchema = { PINATA_JWT: z.string().min(1) };

/**
 * Validates the workflows' settings from `runtimeEnv` (default `process.env`): GROBID, the
 * Pinata gateway and key, a Base Sepolia RPC URL, and Inngest's event and signing keys
 * outside `local` (the dev server needs none), plus the DKG node's (`dkgSchema`, in the
 * same pass) and the shared ones. The Inngest SDK reads its keys itself; they are checked
 * here so a deployed server stops at start without them, and the signing key also reads
 * runs. Throws one `EnvError` naming every bad variable, never its value.
 * `@verisci/workflows/env` builds it once from `process.env`; the functions build it on
 * their first run, and tests call this with their own object.
 */
export function createWorkflowsEnv(runtimeEnv: RuntimeEnv = process.env) {
  const shared = createSharedEnv(runtimeEnv);
  const inngestKey = shared.APP_ENV === "local" ? z.string().min(1).optional() : z.string().min(1);
  return defineEnv({
    extends: [shared],
    server: {
      ...dkgSchema(shared.APP_ENV === "production"),
      GROBID_URL: z.url(),
      PINATA_GATEWAY_URL: z.url(),
      CHAIN_RPC_URL: z.url(),
      ...pinataSchema,
      INNGEST_EVENT_KEY: inngestKey,
      INNGEST_SIGNING_KEY: inngestKey,
      /** Set by Vercel: the branch, which names a staging deployment's Inngest environment. */
      VERCEL_GIT_COMMIT_REF: z.string().optional(),
    },
    runtimeEnv,
  });
}

/** The validated workflows settings, the DKG node's and the shared ones included. */
export type WorkflowsEnv = ReturnType<typeof createWorkflowsEnv>;
