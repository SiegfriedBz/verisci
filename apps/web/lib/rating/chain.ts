import { NoDeploymentError, ratingControllerDeployments } from "@labstrail/contracts";
import type { WebEnv } from "../web-env.ts";

/** Anvil's chain id (ADR 0036). */
const ANVIL_CHAIN_ID = 31_337;

/** Where the paper page sends new rating requests: the chain, the contract, and whether locally. */
export interface RatingChainConfig {
  readonly chainId: number;
  /** The contract that takes new requests, lowercase. */
  readonly contract: string;
  /** True when `APP_ENV=local`: requests go to Anvil, and the page announces them itself. */
  readonly local: boolean;
  /** Anvil's URL, the wallet's local network: set only locally, with the contract's address. */
  readonly rpcUrl?: string;
}

/**
 * The chain and contract new rating requests go to: the environment's current contract on
 * Base Sepolia (ADR 0023), or locally the one deployed on Anvil (ADR 0036). `undefined` when
 * the environment has no deployment, or locally without the Anvil settings, so the page shows
 * ratings can't be requested here.
 */
export function ratingChainConfig(
  env: Pick<WebEnv, "APP_ENV"> &
    Partial<Pick<WebEnv, "LOCAL_CHAIN_RPC_URL" | "LOCAL_RATING_CONTRACT">>,
  deployments: typeof ratingControllerDeployments = ratingControllerDeployments,
): RatingChainConfig | undefined {
  if (env.APP_ENV === "local") {
    if (!env.LOCAL_CHAIN_RPC_URL || !env.LOCAL_RATING_CONTRACT) return undefined;
    return {
      chainId: ANVIL_CHAIN_ID,
      contract: env.LOCAL_RATING_CONTRACT.toLowerCase(),
      local: true,
      rpcUrl: env.LOCAL_CHAIN_RPC_URL,
    };
  }
  try {
    const { chainId, current } = deployments(env.APP_ENV);
    return { chainId, contract: current.address, local: false };
  } catch (error) {
    if (error instanceof NoDeploymentError) return undefined;
    throw error;
  }
}
