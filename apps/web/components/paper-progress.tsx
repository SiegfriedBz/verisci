"use client";

import { ArrowSquareOut, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { refusalMessage } from "../lib/messages.ts";
import { isFinal, type PaperStage } from "../lib/progress.ts";
import { CopyValue } from "./copy-value.tsx";
import { ProgressChain } from "./progress-chain.tsx";

const POLL_MS = 5000;

const HEADLINE: Record<PaperStage["stage"], string> = {
  reading: "Reading your paper",
  saving: "Saving the record",
  minting: "Anchoring it on Base",
  published: "Published",
  refused: "Not published",
  failed: "Publishing stopped",
  "not-found": "No paper here yet",
  "not-published": "Not published",
  unavailable: "Checking on your paper",
};

/**
 * Follows a paper from its page: asks `/api/papers/<cid>` every 5 s until a final stage,
 * and keeps asking through a stage that could not be read.
 */
export function PaperProgress({
  cid,
  eventId,
  resubmitted = false,
}: {
  cid: string;
  eventId: string | undefined;
  /** The visitor just submitted a paper that was already published. */
  resubmitted?: boolean;
}) {
  const [stage, setStage] = useState<PaperStage | undefined>();

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const query = eventId ? `?event=${encodeURIComponent(eventId)}` : "";
    const poll = async () => {
      let next: PaperStage = { stage: "unavailable" };
      try {
        const response = await fetch(`/api/papers/${cid}${query}`, { cache: "no-store" });
        if (response.ok) next = (await response.json()) as PaperStage;
      } catch {
        // Asked again on the next poll.
      }
      if (stopped) return;
      setStage(next);
      if (!isFinal(next)) timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [cid, eventId]);

  if (!stage) {
    return (
      <div aria-busy className="grid gap-4">
        <div className="h-9 w-56 animate-pulse rounded-xl bg-sunken" />
        <div className="h-64 animate-pulse rounded-xl bg-sunken" />
      </div>
    );
  }

  return (
    <div className="enter grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12">
      <div className="grid content-start gap-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {HEADLINE[stage.stage]}
        </h1>
        <StageNote stage={stage} resubmitted={resubmitted} />
        <ProgressChain stage={stage.stage} />
      </div>
      <dl className="grid content-start gap-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
        {stage.stage === "published" && (
          <CopyValue label="Record (UAL)" value={stage.ual} head={22} />
        )}
        <CopyValue label="PDF (CID)" value={cid} />
        <CopyValue label="IPFS link" value={`ipfs://${cid}`} />
        <a
          href={`https://ipfs.io/ipfs/${cid}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          Open the PDF
          <ArrowSquareOut size={14} />
        </a>
      </dl>
    </div>
  );
}

function StageNote({ stage, resubmitted }: { stage: PaperStage; resubmitted: boolean }) {
  switch (stage.stage) {
    case "published":
      if (resubmitted) {
        return (
          <p className="max-w-[60ch] text-muted">
            This PDF was already published, so nothing new was recorded. The record keeps its first
            submitter.
          </p>
        );
      }
      return (
        <p className="max-w-[60ch] text-muted">
          This paper is a public record. Anyone can look it up by its UAL and check who submitted
          it.
        </p>
      );
    case "refused":
      return <Problem text={refusalMessage(stage.reason)} />;
    case "failed":
      return (
        <Problem text="We couldn't finish publishing this paper. Publish the same PDF again and we'll pick up where it stopped." />
      );
    case "not-found":
      return (
        <p className="text-muted">
          Nothing has been published for this PDF yet.{" "}
          <Link href="/publish" className="font-medium text-accent hover:underline">
            Publish a paper
          </Link>
        </p>
      );
    case "not-published":
      return (
        <Problem text="This paper didn't pass our checks. Make sure it's a readable PDF with a title on its first page, then publish it again." />
      );
    case "unavailable":
      return (
        <p className="text-muted">We can't reach the network right now and will keep trying.</p>
      );
    default:
      return (
        <p className="max-w-[60ch] text-muted">
          This takes a few minutes. You can leave this page and come back to the same link.
        </p>
      );
  }
}

function Problem({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="flex max-w-[60ch] items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      <Warning size={18} className="mt-px shrink-0" />
      {text}
    </p>
  );
}
