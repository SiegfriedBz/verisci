import { ORIGINTRAIL_CONTRACTS } from "@labstrail/core";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { addressUrl } from "../../lib/papers/explorer.ts";
import { shorten } from "../../lib/shorten.ts";
import { SITE } from "../../lib/site.ts";
import { Logo } from "./logo.tsx";

/** Base Sepolia, where every environment runs until mainnet (ADR 0015). */
const CHAIN_ID = 84532;

interface ContractRow {
  name: string;
  owner: "OriginTrail" | "LabsTrail";
  role: string;
  address: string;
  /** On Anvil, which no block explorer shows: the address stays unlinked. */
  local?: boolean;
}

/**
 * The site's footer: what LabsTrail is and runs on, links to publishing, the method and the about
 * page, and the contracts behind every record, each
 * linked on Basescan: OriginTrail's, which hold and publish every asset, and the
 * RatingController this environment's pages use, when it has one; locally that is the Anvil
 * one, shown unlinked.
 */
export function SiteFooter({
  ratingController,
}: {
  ratingController: { readonly address: string; readonly local: boolean } | undefined;
}) {
  const origintrail = ORIGINTRAIL_CONTRACTS[CHAIN_ID];
  const rows: ContractRow[] = [
    ...(origintrail
      ? [
          {
            name: "DKGKnowledgeAssets",
            owner: "OriginTrail" as const,
            role: "The ERC-721 contract of each asset's token",
            address: origintrail.knowledgeAssets,
          },
          {
            name: "KnowledgeAssetsLifecycle",
            owner: "OriginTrail" as const,
            role: "Publishes and updates assets",
            address: origintrail.lifecycle,
          },
        ]
      : []),
    ...(ratingController
      ? [
          {
            name: "RatingController",
            owner: "LabsTrail" as const,
            role: ratingController.local
              ? "Records each rating phase's score, on Anvil on this computer"
              : "Records each rating phase's score",
            address: ratingController.address,
            local: ratingController.local,
          },
        ]
      : []),
  ];
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_1.9fr] md:gap-14">
        <div className="grid content-start gap-4">
          <Link href="/" aria-label={`${SITE.name} home`} className="w-fit">
            <Logo />
          </Link>
          <p className="max-w-[40ch] text-sm leading-relaxed text-muted">{SITE.description}</p>
          <p className="w-fit rounded-md border border-line px-2.5 py-1 font-mono text-xs text-muted">
            Base Sepolia testnet · chain {CHAIN_ID}
          </p>
          <nav aria-label="About LabsTrail" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/publish" className="link w-fit">
              Publish a paper
            </Link>
            <Link href="/method" className="link w-fit">
              How the score works
            </Link>
            <Link href="/about" className="link w-fit">
              About LabsTrail
            </Link>
          </nav>
        </div>

        <section aria-labelledby="contracts-title" className="grid content-start gap-3">
          <p id="contracts-title" className="text-sm font-semibold">
            Contracts behind every record
          </p>
          <ul className="glass divide-y divide-line overflow-hidden rounded-2xl">
            {rows.map((row) => (
              <li
                key={row.address}
                className="grid gap-2 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6"
              >
                <span className="grid min-w-0 gap-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{row.name}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
                        row.owner === "LabsTrail"
                          ? "bg-accent-soft text-accent"
                          : "bg-surface-strong text-muted"
                      }`}
                    >
                      {row.owner}
                    </span>
                  </span>
                  <span className="text-sm text-muted">{row.role}</span>
                </span>
                {row.local ? (
                  <span title={row.address} className="font-mono text-xs text-muted">
                    {shorten(row.address, 8, 6)}
                  </span>
                ) : (
                  <a
                    href={addressUrl(row.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-accent-2"
                  >
                    {shorten(row.address, 8, 6)}
                    <ArrowSquareOut size={12} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-x-6 gap-y-1 px-4 py-4 text-xs text-muted sm:px-6">
          <p>
            © {new Date().getFullYear()} {SITE.name}
          </p>
          <p>Built on the OriginTrail DKG, IPFS and Base.</p>
        </div>
      </div>
    </footer>
  );
}
