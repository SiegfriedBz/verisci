"use client";

import { baseSepolia } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useState } from "react";
import { WagmiProvider } from "wagmi";

const WalletReady = createContext(false);

/** Whether the wallet window is set up: false without a Reown project id. */
export function useWalletReady(): boolean {
  return useContext(WalletReady);
}

let adapter: WagmiAdapter | undefined;

/**
 * Builds the wagmi adapter and the AppKit window once per page load, on Base Sepolia
 * only: the Submission's EIP-712 domain names chain 84532, and wallets refuse typed data
 * for another chain than the active one (ADR 0034).
 */
function walletAdapter(projectId: string): WagmiAdapter {
  if (adapter) return adapter;
  adapter = new WagmiAdapter({ projectId, networks: [baseSepolia], ssr: true });
  createAppKit({
    adapters: [adapter],
    projectId,
    networks: [baseSepolia],
    defaultNetwork: baseSepolia,
    metadata: {
      name: "VeriSci",
      description: "Publish a paper as a record anyone can verify.",
      url: typeof window === "undefined" ? "https://verisci.app" : window.location.origin,
      icons: [],
    },
    features: { analytics: false },
    themeVariables: {
      // A darker emerald than --accent: AppKit writes white text on its accent, and white on
      // the page's emerald would fail contrast.
      "--apkt-accent": "#0d7a55",
      "--apkt-border-radius-master": "3px",
      "--apkt-font-family": "var(--font-sora), ui-sans-serif, system-ui, sans-serif",
    },
  });
  return adapter;
}

/**
 * Wallet and query providers. The project id comes from the server (`REOWN_PROJECT_ID`),
 * so no value is inlined at build time; without one, the pages render and say the wallet
 * is not set up.
 */
export function Providers({
  projectId,
  children,
}: {
  projectId: string | undefined;
  children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());
  if (!projectId) return <WalletReady value={false}>{children}</WalletReady>;
  return (
    <WagmiProvider config={walletAdapter(projectId).wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletReady value={true}>{children}</WalletReady>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
