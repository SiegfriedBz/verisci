import { NoDeploymentError, ratingControllerDeployments } from "@verisci/contracts";
import type { Metadata } from "next";
import { Martian_Mono, Sora } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Logo } from "../components/logo.tsx";
import { NavLink } from "../components/nav-link.tsx";
import { Providers } from "../components/providers.tsx";
import { SiteFooter } from "../components/site-footer.tsx";
import { WalletButton } from "../components/wallet-button.tsx";
import { createWebEnv } from "../lib/web-env.ts";
import "./globals.css";

const sans = Sora({ subsets: ["latin"], variable: "--font-sora" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-martian" });

const DESCRIPTION =
  "Publish a paper as a Knowledge Asset on the OriginTrail DKG, signed by your wallet, so anyone can verify who submitted it.";

export const metadata: Metadata = {
  title: "VeriSci",
  description: DESCRIPTION,
  openGraph: { title: "VeriSci", description: DESCRIPTION, siteName: "VeriSci", type: "website" },
  twitter: { card: "summary", title: "VeriSci", description: DESCRIPTION },
};

/**
 * The shell: header with the wallet button, then the page. Rendered per request, so the
 * Reown project id is read from the server's settings, never inlined at build time.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  const { APP_ENV, REOWN_PROJECT_ID } = createWebEnv();
  const ratingController = currentRatingController(APP_ENV);
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} overflow-x-clip`}>
      <body className="relative min-h-[100dvh] overflow-x-hidden font-sans antialiased">
        <div aria-hidden className="bench pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-30 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-ink"
        >
          Skip to content
        </a>
        <Providers projectId={REOWN_PROJECT_ID}>
          <header className="sticky top-0 z-20 border-b border-line bg-page/70 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
              <Link href="/" aria-label="VeriSci home">
                <Logo />
              </Link>
              <nav className="flex items-center gap-3 sm:gap-6">
                <NavLink href="/publish">Publish</NavLink>
                <WalletButton />
              </nav>
            </div>
          </header>
          <main id="main" className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
            {children}
          </main>
          <SiteFooter ratingController={ratingController} />
        </Providers>
      </body>
    </html>
  );
}

/** This environment's current RatingController address, or none while it has no deployment. */
function currentRatingController(appEnv: "local" | "staging" | "production"): string | undefined {
  try {
    return ratingControllerDeployments(appEnv).current.address;
  } catch (error) {
    if (error instanceof NoDeploymentError) return undefined;
    throw error;
  }
}
