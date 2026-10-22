import { canonicalCid } from "@labstrail/core";
import { shorten } from "../../lib/shorten.ts";
import { Breadcrumbs } from "../site/breadcrumbs.tsx";
import {
  PUBLISH_PANEL_LABELS,
  PUBLISH_PANEL_TITLE,
  VERIFY_INTRO,
  VERIFY_LABELS,
  VERIFY_TITLE,
} from "./labels.ts";
import { VerifyGroup } from "./verify-panel.tsx";

/**
 * A paper's page while the server reads it. What is known already shows: the breadcrumbs,
 * the side panel's heading, groups and labels, and the PDF's CID; only what the node answers
 * pulses. A visitor following a publish (`?event=`) sees the chain of steps and the publish
 * panel's labels; anyone else, a published paper's shape (abstract, one row of steps) and the
 * verify panel's, since a paper reached from the list is published. Its panel titles are
 * paragraphs, so the page's first heading is the paper's own `h1` once it streams in.
 */
export function PaperSkeleton({ cid: given, following }: { cid: string; following: boolean }) {
  const cid = canonicalCid(given) ?? given;
  return (
    <div className="grid gap-6">
      <Breadcrumbs items={[{ label: "Papers", href: "/papers" }, { label: shorten(cid) }]} />
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading paper"
        className="grid items-start gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12"
      >
        <div className="grid content-start gap-6">
          <div className="grid gap-3">
            <Bar className="h-6 w-24" />
            <Bar className="h-8 w-full" />
            <Bar className="h-8 w-3/4" />
            <Bar className="mt-1 h-4 w-2/3" />
          </div>
          {following ? <FollowedSteps /> : <PublishedBody />}
        </div>
        {following ? <PublishPanel cid={cid} /> : <VerifyPanelSkeleton cid={cid} />}
      </div>
    </div>
  );
}

/** A published paper's body: its abstract under its heading, a note, and the row of steps. */
function PublishedBody() {
  return (
    <>
      <div className="grid gap-2">
        <Bar className="h-4 w-20" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-11/12" />
        <Bar className="h-4 w-2/3" />
      </div>
      <Bar className="h-4 w-5/6" />
      <div className="grid grid-cols-4 gap-2">
        {["read", "saved", "minted", "published"].map((step) => (
          <div key={step} className="grid gap-2">
            <div className="size-5 animate-pulse rounded-full bg-surface-strong" />
            <Bar className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </>
  );
}

/** A followed publish's body: a note, then the chain of steps with their details. */
function FollowedSteps() {
  return (
    <>
      <div className="grid gap-2">
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-5/6" />
      </div>
      <div className="grid gap-5">
        {["read", "saved", "minted", "published"].map((step) => (
          <div key={step} className="flex items-start gap-4">
            <div className="size-8 shrink-0 animate-pulse rounded-full bg-surface-strong" />
            <div className="grid flex-1 gap-2 pt-1">
              <Bar className="h-4 w-28" />
              <Bar className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** `VerifyPanel` with its groups and labels, its values to come, and the CID, which the address gives. */
function VerifyPanelSkeleton({ cid }: { cid: string }) {
  return (
    <section className="glass grid gap-6 rounded-2xl p-5 sm:p-6">
      <div className="grid gap-1">
        <p className="text-lg font-semibold">{VERIFY_TITLE}</p>
        <p className="text-sm leading-relaxed text-muted">{VERIFY_INTRO}</p>
      </div>
      <Bar className="h-9 w-full rounded-xl" />
      <VerifyGroup group="submission" heading={false}>
        <Field label={VERIFY_LABELS.submitter} />
        <Field label={VERIFY_LABELS.signature} />
        <Field label={VERIFY_LABELS.deadline} />
        <Field label={VERIFY_LABELS.contextGraph} />
      </VerifyGroup>
      <VerifyGroup group="asset" heading={false}>
        <Field label={VERIFY_LABELS.publisher} />
        <Field label={VERIFY_LABELS.token} />
        <Field label={VERIFY_LABELS.ual} />
        <Field label={VERIFY_LABELS.pdf} value={shorten(cid)} />
      </VerifyGroup>
      <Bar className="h-11 w-full rounded-xl" />
    </section>
  );
}

/** The panel beside a paper being published, with what is happening still to come. */
function PublishPanel({ cid }: { cid: string }) {
  return (
    <aside className="glass grid content-start gap-5 rounded-2xl p-5 sm:p-6">
      <div className="grid gap-2">
        <p className="text-sm font-semibold">{PUBLISH_PANEL_TITLE}</p>
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-2/3" />
      </div>
      <dl className="grid gap-5">
        <Field label={PUBLISH_PANEL_LABELS.pdf} value={shorten(cid)} />
        <Field label={PUBLISH_PANEL_LABELS.ipfs} value={shorten(`ipfs://${cid}`)} />
      </dl>
    </aside>
  );
}

/** A `CopyValue` row: its label, and its value or a placeholder for it. */
function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2">
        {value ? (
          <code className="min-w-0 truncate font-mono text-sm">{value}</code>
        ) : (
          <Bar className="h-5 w-56 max-w-full" />
        )}
        <span aria-hidden className="size-7 shrink-0 rounded-lg border border-line" />
      </dd>
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-strong ${className}`} />;
}
