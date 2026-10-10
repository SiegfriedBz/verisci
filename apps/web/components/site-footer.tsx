import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import { ORIGINTRAIL_CONTRACTS } from "@verisci/core";
import { addressUrl } from "../lib/explorer.ts";
import { shorten } from "../lib/shorten.ts";

/** Base Sepolia, where every environment runs until mainnet (ADR 0015). */
const CHAIN_ID = 84532;

/**
 * The contracts VeriSci runs on, each linked on Basescan: OriginTrail's, which hold and
 * publish every asset, and our RatingController for this environment, when it is deployed.
 */
export function SiteFooter({ ratingController }: { ratingController: string | undefined }) {
  const origintrail = ORIGINTRAIL_CONTRACTS[CHAIN_ID];
  const contracts = [
    ...(origintrail
      ? [
          {
            name: "DKGKnowledgeAssets",
            owner: "OriginTrail",
            role: "Holds every asset's ERC-721 token",
            address: origintrail.knowledgeAssets,
          },
          {
            name: "KnowledgeAssetsLifecycle",
            owner: "OriginTrail",
            role: "Publishes and updates assets",
            address: origintrail.lifecycle,
          },
        ]
      : []),
    ...(ratingController
      ? [
          {
            name: "RatingController",
            owner: "VeriSci",
            role: "Records rating scores, once rating opens",
            address: ratingController,
          },
        ]
      : []),
  ];
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-6">
        <h2 className="text-sm font-semibold">Contracts on Base Sepolia (testnet)</h2>
        <ul className="grid gap-5 sm:grid-cols-3">
          {contracts.map((contract) => (
            <li key={contract.address} className="grid gap-1 text-sm">
              <span className="font-medium">
                {contract.name} <span className="font-normal text-muted">· {contract.owner}</span>
              </span>
              <span className="text-muted">{contract.role}</span>
              <a
                href={addressUrl(contract.address)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1.5 font-mono text-xs text-accent hover:underline"
              >
                {shorten(contract.address, 8, 6)}
                <ArrowSquareOut size={12} />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
