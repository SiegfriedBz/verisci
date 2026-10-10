import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Providers } from "../components/providers.tsx";
import { WalletButton } from "../components/wallet-button.tsx";
import { createWebEnv } from "../lib/web-env.ts";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "verisci",
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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-[100dvh] font-sans antialiased">
        <Providers projectId={REOWN_PROJECT_ID}>
          <header className="border-b border-line">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
              <Link href="/" className="font-mono text-lg font-semibold tracking-tight">
                verisci
              </Link>
              <nav className="flex items-center gap-3 sm:gap-6">
                <Link href="/publish" className="text-sm font-medium text-muted hover:text-ink">
                  Publish
                </Link>
                <WalletButton />
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
