"use client";

import { AppKitButton } from "@reown/appkit/react";
import { useWalletReady } from "./providers.tsx";

/** The wallet connect button, or a quiet note when the wallet window is not set up. */
export function WalletButton() {
  if (!useWalletReady()) {
    return <span className="text-sm text-muted">Wallet not set up</span>;
  }
  return <AppKitButton balance="hide" size="sm" label="Connect wallet" />;
}
