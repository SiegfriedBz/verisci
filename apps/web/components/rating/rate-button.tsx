"use client";

import { ratingControllerAbi } from "@labstrail/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { announceLocalRating } from "../../app/actions.ts";
import type { RatingChainConfig } from "../../lib/rating/chain.ts";
import { requestMessage } from "../../lib/rating/messages.ts";
import { type RequestResult, requestRating } from "../../lib/rating/request-flow.ts";
import { newRatingPath } from "../../lib/rating/stage.ts";
import { useWallet, useWalletReady } from "../wallet/providers.tsx";

/** How long the button waits for the request's transaction to be mined. */
const RECEIPT_TIMEOUT_MS = 90_000;

/**
 * The button that requests a rating, labelled `label` ("Rate this paper" unless given), or a
 * note when the wallet window is not set up on this server.
 */
export function RateButton(props: {
  ual: string;
  cid: string;
  config: RatingChainConfig;
  label?: string;
}) {
  if (!useWalletReady()) {
    return (
      <p className="text-sm text-muted">
        Wallet connection isn't set up on this server yet, so ratings can't be requested here.
      </p>
    );
  }
  return <RateFlow {...props} />;
}

type Phase = "idle" | "loading" | "sending" | "confirming";

/**
 * Requests a rating from the visitor's wallet (`requestRating`), loading the wallet first when
 * the page hasn't yet (it starts loading when the pointer, focus or a touch reaches the
 * button), then opens the rating's page, which follows it. Names a revert it knows, and says
 * when the wallet couldn't load, or the request is on chain but its receipt or, locally, its
 * announce did not come.
 */
function RateFlow({
  ual,
  cid,
  config,
  label = "Rate this paper",
}: {
  ual: string;
  cid: string;
  config: RatingChainConfig;
  label?: string;
}) {
  const router = useRouter();
  const wallet = useWallet();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<RequestResult | undefined>();

  const rate = async () => {
    setResult(undefined);
    let runtime = wallet.runtime;
    if (!runtime) {
      setPhase("loading");
      try {
        runtime = await wallet.load();
      } catch {
        setPhase("idle");
        setResult({ ok: false, problem: "wallet-unavailable" });
        return;
      }
    }
    const loaded = runtime;
    setPhase("sending");
    const answer = await requestRating(ual, {
      chainId: config.chainId,
      contract: config.contract,
      local: config.local,
      account: () => loaded.account(),
      connect: () => void loaded.open(),
      switchChain: (id) => loaded.switchChain(id),
      sendRequest: async (target) => {
        const hash = await loaded.writeContract({
          address: config.contract as `0x${string}`,
          abi: ratingControllerAbi,
          functionName: "requestPhase1",
          args: [target],
          chainId: config.chainId,
        });
        setPhase("confirming");
        return hash;
      },
      waitForReceipt: async (hash) => {
        const receipt = await loaded.waitForReceipt(hash, config.chainId, RECEIPT_TIMEOUT_MS);
        return { reverted: receipt.status === "reverted", logs: receipt.logs };
      },
      announce: (hash) => announceLocalRating(hash),
    });
    setPhase("idle");
    if (answer.ok && "requestId" in answer && !answer.notAnnounced) {
      router.push(newRatingPath(cid, answer.requestId));
      return;
    }
    setResult(answer);
  };

  const busy = phase !== "idle";
  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={() => void rate()}
        onPointerEnter={wallet.preload}
        onFocus={wallet.preload}
        onTouchStart={wallet.preload}
        disabled={busy}
        aria-busy={busy}
        className="signal-gradient w-fit rounded-xl px-5 py-2.5 font-semibold text-accent-ink transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
      >
        {phase === "loading"
          ? "Opening your wallet"
          : phase === "sending"
            ? "Confirm in your wallet"
            : phase === "confirming"
              ? "Waiting for the transaction"
              : label}
      </button>
      {result && <ResultNote result={result} cid={cid} />}
    </div>
  );
}

function ResultNote({ result, cid }: { result: RequestResult; cid: string }) {
  if (!result.ok) {
    if (result.problem === "connect" || result.problem === "declined") return null;
    return (
      <p role="alert" className="text-sm text-danger">
        {requestMessage(result.problem)}
      </p>
    );
  }
  if ("unconfirmed" in result) {
    return (
      <p role="status" className="text-sm leading-relaxed text-muted">
        Your request was sent. It shows in this list once its transaction is confirmed.
      </p>
    );
  }
  return (
    <p role="status" className="text-sm leading-relaxed text-muted">
      Your request is on chain, but its rating didn't start: the server couldn't announce it, and
      the <code className="font-mono text-xs text-ink">pnpm dev</code> terminal says why.{" "}
      <Link href={`/papers/${cid}/ratings/${result.requestId}`} className="link">
        Open the request
      </Link>
    </p>
  );
}
