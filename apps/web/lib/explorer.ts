import { knowledgeAssetToken, parseUal } from "@verisci/core";

/** Base Sepolia's block explorer, where staging and production both run until mainnet (ADR 0015). */
const BASESCAN = "https://sepolia.basescan.org";

/** The Basescan page of an address: its transactions, and for our node, every mint. */
export function addressUrl(address: string): string {
  return `${BASESCAN}/address/${address.toLowerCase()}`;
}

/**
 * The Basescan page of the ERC-721 token behind a UAL, which shows its owner and its mint,
 * or `undefined` when the string is not a UAL or its chain's contracts are not recorded.
 */
export function assetTokenUrl(ual: string): string | undefined {
  const parsed = parseUal(ual);
  const token = parsed.ok ? knowledgeAssetToken(parsed.ual) : undefined;
  return token && `${BASESCAN}/nft/${token.contract}/${token.tokenId}`;
}
