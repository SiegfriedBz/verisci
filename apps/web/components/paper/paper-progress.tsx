"use client";

import { canonicalCid } from "@labstrail/core";
import { ArrowSquareOut, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ipfsUrl } from "../../lib/papers/explorer.ts";
import { failureMessage, refusalMessage } from "../../lib/publish/messages.ts";
import { isFinal, type PaperStage } from "../../lib/publish/progress.ts";
import type { PaperView } from "../../lib/publish/upload-actions.ts";
import { shorten } from "../../lib/shorten.ts";
import { Breadcrumbs } from "../site/breadcrumbs.tsx";
import { Abstract } from "./abstract.tsx";
import { CopyValue } from "./copy-value.tsx";
import { PUBLISH_PANEL_LABELS, PUBLISH_PANEL_TITLE } from "./labels.ts";
import { ProgressChain } from "./progress-chain.tsx";
import { VerifyPanel } from "./verify-panel.tsx";

const POLL_MS = 5000;

const HEADLINE: Record<PaperStage["stage"], string> = {
  reading: "Reading your paper",
  following: "Already being published",
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
  following:
    "Another submission of this PDF is being published right now, so yours started nothing new. This page follows that one and updates when the paper is saved and minted.",
  reading:
    "We fetch your PDF from IPFS, read its title, authors, abstract and DOI, and check it's a life-science or health paper. Nothing is written yet. When our check is busy, this can take a few minutes.",
  saving:
    "The record is written to LabsTrail's DKG node, then shared to the context graph's shared memory, where peer nodes acknowledge it.",
  minting:
    "The node mints the record on Base as a Knowledge Asset: a token, and the merkle root of its statements, so any change to the content would no longer match.",
};

/**
 * Follows a paper from its page, starting from the view the server read (`PaperLoader`):
 * unless that view is final, asks `/api/papers/<cid>` every 5 s until a final stage, and
 * keeps asking through a stage that could not be read. Once published, shows the record,
 * its abstract, its steps as one row, and how to verify it; when the server rendered it
 * unpublished, has it render the page once more (`router.refresh`), so the ratings section
 * appears under it. Shows and asks by the CID's
 * canonical spelling, the one the signature covers, whatever spelling the address has.
 */
export function PaperProgress({
  cid: given,
  contextGraph,
  eventId,
  initial,
  resubmitted = false,
}: {
  cid: string;
  /** The context graph this environment publishes to, which the signature covers. */
  contextGraph: string;
  eventId: string | undefined;
  /** Where the paper stood when the server read it. */
  initial: PaperView;
  /** The visitor just submitted a paper that was already published. */
  resubmitted?: boolean;
}) {
  const cid = canonicalCid(given) ?? given;
  const [view, setView] = useState<PaperView>(initial);
  const router = useRouter();
  // The server renders the ratings section only under a published paper: whether it has.
  const rendered = useRef(initial.stage === "published");

  useEffect(() => {
    if (isFinal(initial)) return;
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
      if (next.stage === "published" && !rendered.current) {
        rendered.current = true;
        router.refresh();
      }
      if (!isFinal(next)) timer = setTimeout(() => void poll(), POLL_MS);
    };
    timer = setTimeout(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [cid, eventId, initial, router]);

  const record = view.stage === "published" ? view.record : undefined;
  const trail = (
    <Breadcrumbs
      items={[{ label: "Papers", href: "/papers" }, { label: record?.title ?? shorten(cid) }]}
    />
  );

  const pill =
    view.stage === "published"
      ? resubmitted
        ? "Already published"
        : "Published"
      : HEADLINE[view.stage];
  return (
    <div className="grid gap-6">
      {trail}
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
            <h1
              className={`text-balance font-semibold leading-tight tracking-tight ${titleSize(record?.title)}`}
            >
              {record?.title ?? HEADLINE[view.stage]}
            </h1>
            {record && record.authors.length > 0 && <Authors names={record.authors} />}
            {record?.doi && (
              <a
                href={`https://doi.org/${record.doi}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-ink"
              >
                doi:{record.doi}
                <ArrowSquareOut size={12} />
              </a>
            )}
          </div>
          {record?.abstract && <Abstract text={record.abstract} />}
          <StageNote stage={view} resubmitted={resubmitted} />
          <ProgressChain stage={view.stage} compact={view.stage === "published"} />
        </div>
        {view.stage === "published" && record ? (
          <VerifyPanel record={record} ual={view.ual} cid={cid} contextGraph={contextGraph} />
        ) : (
          <aside className="glass grid content-start gap-5 rounded-2xl p-5 sm:p-6">
            {NOW[view.stage] && (
              <div className="grid gap-1">
                <h2 className="text-sm font-semibold">{PUBLISH_PANEL_TITLE}</h2>
                <p className="text-sm leading-relaxed text-muted">{NOW[view.stage]}</p>
              </div>
            )}
            <dl className="grid gap-5">
              {view.stage === "published" && (
                <CopyValue label={PUBLISH_PANEL_LABELS.ual} value={view.ual} head={22} />
              )}
              <CopyValue label={PUBLISH_PANEL_LABELS.pdf} value={cid} href={ipfsUrl(cid)} />
              <CopyValue label={PUBLISH_PANEL_LABELS.ipfs} value={`ipfs://${cid}`} />
            </dl>
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * The headline's size: a stage's few words and a short title large, a long title smaller,
 * so a 200-character title doesn't fill a phone's screen.
 */
function titleSize(title: string | undefined): string {
  if (title === undefined || title.length <= 60) return "text-2xl sm:text-4xl";
  if (title.length <= 120) return "text-2xl sm:text-3xl";
  return "text-xl sm:text-2xl";
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
      if (stage.recordProblem === "unavailable")
        return (
          <p className="max-w-[60ch] leading-relaxed text-muted">
            Published. We couldn't load its record from the DKG node right now and are asking again
            every few seconds.
          </p>
        );
      if (stage.recordProblem === "unreadable")
        return (
          <Problem text="Published, but its record on the DKG can't be read, so it can't be shown here. Its UAL and CID are below." />
        );
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
      return <Problem text={failureMessage(stage.reason)} />;
    case "not-published":
      return (
        <Problem text="This paper wasn't published. Make sure it's a readable PDF of a life-science or health paper, with its title on the first page, then publish it again." />
      );
    case "not-found":
      return (
        <p className="text-muted">
          Nothing has been published for this PDF yet.{" "}
          <Link href="/publish" className="link">
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
