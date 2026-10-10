"use client";

import { ArrowSquareOut, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ipfsUrl } from "../lib/explorer.ts";
import { refusalMessage } from "../lib/messages.ts";
import { isFinal, type PaperStage } from "../lib/progress.ts";
import type { PaperView } from "../lib/upload-actions.ts";
import { CopyValue } from "./copy-value.tsx";
import { ProgressChain } from "./progress-chain.tsx";
import { VerifyPanel } from "./verify-panel.tsx";

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

/** What happens during each step, for the panel beside the chain. */
const NOW: Partial<Record<PaperStage["stage"], string>> = {
  reading:
    "We fetch your PDF from IPFS and read its first page: title, authors, abstract and DOI. Nothing is written yet.",
  saving:
    "The record is written to VeriSci's DKG node, then shared to the context graph's shared memory, where peer nodes acknowledge it.",
  minting:
    "The node mints the record on Base as a Knowledge Asset: a token, and the merkle root of its statements, so any change to the content would no longer match.",
};

/**
 * Follows a paper from its page: asks `/api/papers/<cid>` every 5 s until a final stage,
 * and keeps asking through a stage that could not be read. Once published, shows the
 * record and how to verify it.
 */
export function PaperProgress({
  cid,
  contextGraph,
  eventId,
  resubmitted = false,
}: {
  cid: string;
  /** The context graph this environment publishes to, which the signature covers. */
  contextGraph: string;
  eventId: string | undefined;
  /** The visitor just submitted a paper that was already published. */
  resubmitted?: boolean;
}) {
  const [view, setView] = useState<PaperView | undefined>();

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const query = eventId ? `?event=${encodeURIComponent(eventId)}` : "";
    const poll = async () => {
      let next: PaperView = { stage: "unavailable" };
      try {
        const response = await fetch(`/api/papers/${cid}${query}`, { cache: "no-store" });
        if (response.ok) next = (await response.json()) as PaperView;
      } catch {
        // Asked again on the next poll.
      }
      if (stopped) return;
      setView(next);
      if (!isFinal(next)) timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [cid, eventId]);

  if (!view) {
    return (
      <div aria-busy className="grid gap-4">
        <div className="h-9 w-56 animate-pulse rounded-xl bg-surface-strong" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-strong" />
      </div>
    );
  }

  const record = view.stage === "published" ? view.record : undefined;
  const pill =
    view.stage === "published"
      ? resubmitted
        ? "Already published"
        : "Published"
      : HEADLINE[view.stage];
  return (
    <div className="enter grid items-start gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12">
      <div className="grid content-start gap-6">
        <div className="grid gap-3">
          <p
            className={`w-fit rounded-md px-2.5 py-1 text-xs font-medium ${
              view.stage === "published"
                ? "bg-accent-soft text-accent"
                : "bg-surface-strong text-muted"
            }`}
          >
            {pill}
          </p>
          <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            {record?.title ?? HEADLINE[view.stage]}
          </h1>
          {record && record.authors.length > 0 && <Authors names={record.authors} />}
          {record?.doi && (
            <a
              href={`https://doi.org/${record.doi}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 font-mono text-xs text-accent hover:underline"
            >
              doi:{record.doi}
              <ArrowSquareOut size={12} />
            </a>
          )}
        </div>
        <StageNote stage={view} resubmitted={resubmitted} />
        <ProgressChain stage={view.stage} />
      </div>
      {view.stage === "published" && record ? (
        <VerifyPanel record={record} ual={view.ual} cid={cid} contextGraph={contextGraph} />
      ) : (
        <aside className="glass grid content-start gap-5 rounded-2xl p-5 sm:p-6">
          {NOW[view.stage] && (
            <div className="grid gap-1">
              <h2 className="text-sm font-semibold">What's happening now</h2>
              <p className="text-sm leading-relaxed text-muted">{NOW[view.stage]}</p>
            </div>
          )}
          <dl className="grid gap-5">
            {view.stage === "published" && (
              <CopyValue label="Knowledge Asset (UAL)" value={view.ual} head={22} />
            )}
            <CopyValue label="PDF (CID)" value={cid} href={ipfsUrl(cid)} />
            <CopyValue label="IPFS link" value={`ipfs://${cid}`} />
          </dl>
        </aside>
      )}
    </div>
  );
}

const SHOWN_AUTHORS = 6;

/** The authors, the first six and how many more: GROBID can read a sidebar as authors. */
function Authors({ names }: { names: readonly string[] }) {
  const more = names.length - SHOWN_AUTHORS;
  return (
    <p className="text-sm leading-relaxed text-muted">
      {names.slice(0, SHOWN_AUTHORS).join(", ")}
      {more > 0 && ` and ${more} more`}
    </p>
  );
}

function StageNote({ stage, resubmitted }: { stage: PaperView; resubmitted: boolean }) {
  switch (stage.stage) {
    case "published":
      return resubmitted ? (
        <p className="max-w-[60ch] leading-relaxed text-muted">
          This PDF was already published, so nothing new was recorded. The record keeps its first
          submitter.
        </p>
      ) : (
        <p className="max-w-[60ch] leading-relaxed text-muted">
          This paper is a public record. Anyone with a DKG node can fetch it and check who submitted
          it: the panel shows how.
        </p>
      );
    case "refused":
      return <Problem text={refusalMessage(stage.reason)} />;
    case "failed":
      return (
        <Problem text="We couldn't finish publishing this paper. Publish the same PDF again and we'll pick up where it stopped." />
      );
    case "not-published":
      return (
        <Problem text="This paper didn't pass our checks. Make sure it's a readable PDF with a title on its first page, then publish it again." />
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
    case "unavailable":
      return (
        <p className="text-muted">We can't reach the network right now and will keep trying.</p>
      );
    default:
      return (
        <p className="max-w-[60ch] leading-relaxed text-muted">
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
