import type { Ual } from "./ual.ts";

/** OriginTrail's contracts on one chain, lowercase. */
export interface OriginTrailContracts {
  /** `DKGKnowledgeAssets` (symbol DKA): the ERC-721 contract holding every asset's token. */
  readonly knowledgeAssets: `0x${string}`;
  /** `KnowledgeAssetsLifecycle`: the contract a node calls to publish and update assets. */
  readonly lifecycle: `0x${string}`;
}

/**
 * OriginTrail's contracts by chain id, read from a mint by our node on Base Sepolia
 * (`docs/domain.md` → DKG). A chain missing here has no known contracts.
 */
export const ORIGINTRAIL_CONTRACTS: Readonly<Record<number, OriginTrailContracts>> = {
  84532: {
    knowledgeAssets: "0x2b2e1bcb7c52a1587264e01f6b53782d791e6fa0",
    lifecycle: "0x835f921a0fc8d6365c34a0bb9b37d10c98c1b8c3",
  },
};

/** A V10 asset number fills the token id's low 96 bits; the author's address fills the rest. */
const NUMBER_BITS = 96n;

/**
 * The ERC-721 token behind a UAL: the contract and the token id, or `undefined` when the
 * chain's contracts are not recorded or the number does not fit. A UAL naming the
 * KnowledgeAssets contract carries the token id itself; a V10 UAL names its author, packed
 * into the token id above the asset number (`docs/domain.md` → DKG).
 */
export function knowledgeAssetToken(
  ual: Ual,
): { readonly contract: `0x${string}`; readonly tokenId: bigint } | undefined {
  const contracts = ORIGINTRAIL_CONTRACTS[ual.chainId];
  if (!contracts) return undefined;
  const contract = contracts.knowledgeAssets;
  if (ual.address === contract) return { contract, tokenId: ual.id };
  if (ual.id >= 1n << NUMBER_BITS) return undefined;
  return { contract, tokenId: (BigInt(ual.address) << NUMBER_BITS) | ual.id };
}
