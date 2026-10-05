import { z } from "zod";

/** The contract stores the pending cap as a `uint8`. */
const UINT8_MAX = 255;

const address = z.string().regex(/^0x[0-9a-f]{40}$/, "expected a lowercase 0x address");

const deploymentSchema = z.object({
  address,
  txHash: z.string().regex(/^0x[0-9a-f]{64}$/, "expected a lowercase 0x transaction hash"),
  blockNumber: z.int().nonnegative(),
  owner: address,
  oracleAgent: address,
  maxPendingPerRequester: z.int().min(1).max(UINT8_MAX),
  commit: z.string().min(1),
});

const environmentSchema = z.object({
  current: deploymentSchema.nullable(),
  past: z.array(deploymentSchema),
});

const deploymentsFileSchema = z.object({
  chainId: z.int().positive(),
  staging: environmentSchema,
  production: environmentSchema,
});

/** One RatingController deployment, as the recorder writes it from a broadcast run. */
export type Deployment = z.infer<typeof deploymentSchema>;

/** The deployments file: each environment's current deployment and its past ones, newest first. */
export type DeploymentsFile = z.infer<typeof deploymentsFileSchema>;

/** An environment that has its own RatingController deployments (ADR 0005). */
export type DeployEnv = "staging" | "production";

/** An environment's deployments: `current` takes new requests, `past` are paused (ADR 0027). */
export interface RatingControllerDeployments {
  chainId: number;
  current: Deployment;
  past: readonly Deployment[];
}

/** Thrown when an environment has no current RatingController deployment yet. */
export class NoDeploymentError extends Error {
  /** The environment that has no deployment. */
  readonly deployEnv: DeployEnv;

  /** @param deployEnv The environment that has no deployment. */
  constructor(deployEnv: DeployEnv) {
    super(`No RatingController is deployed for ${deployEnv} yet (deployments/base-sepolia.json)`);
    this.name = "NoDeploymentError";
    this.deployEnv = deployEnv;
  }
}

/**
 * Validates a deployments file.
 * @throws Error naming each invalid field, such as `staging.current.address`.
 */
export function parseDeployments(input: unknown): DeploymentsFile {
  const result = deploymentsFileSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid deployments file:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/**
 * An environment's deployments from a parsed file. `local` reads staging's, which is the
 * contract local development and previews use (ADR 0005).
 * @throws NoDeploymentError when that environment has no current deployment.
 */
export function resolveDeployments(
  file: DeploymentsFile,
  appEnv: DeployEnv | "local",
): RatingControllerDeployments {
  const deployEnv = appEnv === "local" ? "staging" : appEnv;
  const { current, past } = file[deployEnv];
  if (current === null) throw new NoDeploymentError(deployEnv);
  return { chainId: file.chainId, current, past };
}
