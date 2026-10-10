/** Base Sepolia's block explorer, where staging and production both run until mainnet (ADR 0015). */
const BASESCAN = "https://sepolia.basescan.org";

/** The Basescan page of an address: its transactions, and for our node, every mint. */
export function addressUrl(address: string): string {
  return `${BASESCAN}/address/${address.toLowerCase()}`;
}
