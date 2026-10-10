"use client";

import { AppKitAccountButton, useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { useWalletReady } from "./providers.tsx";

/** The wallet button: ours to connect, AppKit's account button once connected. */
export function WalletButton() {
  if (!useWalletReady()) {
    return <span className="text-sm text-muted">Wallet not set up</span>;
  }
  return <ConnectedWalletButton />;
}

function ConnectedWalletButton() {
  const { isConnected } = useAccount();
  const { open } = useAppKit();
  if (isConnected) return <AppKitAccountButton balance="hide" />;
  return (
    <button
      type="button"
      onClick={() => void open()}
      className="rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink transition hover:brightness-110 active:scale-[0.98]"
    >
      Connect wallet
    </button>
  );
}
