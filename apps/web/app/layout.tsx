import type { Metadata } from "next";
import { Martian_Mono, Sora } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Logo } from "../components/logo.tsx";
import { Providers } from "../components/providers.tsx";
import { WalletButton } from "../components/wallet-button.tsx";
import { createWebEnv } from "../lib/web-env.ts";
import "./globals.css";

const sans = Sora({ subsets: ["latin"], variable: "--font-sora" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-martian" });

export const metadata: Metadata = {
  title: "VeriSci",
  description: "Publish a paper as a record anyone can verify.",
};

/**
 * The shell: header with the wallet button, then the page. Rendered per request, so the
 * Reown project id is read from the server's settings, never inlined at build time.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  const { REOWN_PROJECT_ID } = createWebEnv();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} overflow-x-clip`}>
      <body className="relative min-h-[100dvh] overflow-x-hidden font-sans antialiased">
        <div aria-hidden className="bench pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
        <Providers projectId={REOWN_PROJECT_ID}>
          <header className="sticky top-0 z-20 border-b border-line bg-page/70 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
              <Link href="/" aria-label="VeriSci home">
                <Logo />
              </Link>
              <nav className="flex items-center gap-3 sm:gap-6">
                <Link href="/publish" className="text-sm font-medium text-muted hover:text-ink">
                  Publish
                </Link>
                <WalletButton />
              </nav>
            </div>
          </header>
          <main className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
