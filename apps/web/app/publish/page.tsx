import { Eye, Gauge, PenNib, Repeat } from "@phosphor-icons/react/dist/ssr";
import { getUploadService, PUBLISH_SETTINGS, UPLOAD_SETTINGS } from "@verisci/agents";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PublishForm } from "../../components/publish-form.tsx";
import { UPLOAD_LIMITS } from "../../lib/limits.ts";

export const metadata: Metadata = { title: "Publish a paper · VeriSci" };

const BEFORE = [
  {
    icon: Eye,
    title: "Your PDF becomes public",
    body: "It's stored on IPFS, where anyone can download it. Publish your own work, or a paper you're allowed to share, such as an open-access one.",
  },
  {
    icon: PenNib,
    title: "You sign, you don't pay",
    body: "Your wallet signs the PDF's fingerprint (its CID), VeriSci's graph and a 10-minute deadline. No transaction, no gas.",
  },
  {
    icon: Repeat,
    title: "One PDF, one record",
    body: "The same file always gives the same record. Publishing it again changes nothing, and the first submitter stays.",
  },
  {
    icon: Gauge,
    title: "Limits",
    body: `You can publish up to ${UPLOAD_LIMITS.submissionsPerAddressPerDay} papers per wallet every 24 hours; a paper that's already published doesn't count. Each PDF you drop is stored before you sign, so uploads have their own cap: ${UPLOAD_LIMITS.urlsPerIpPerDay} per internet connection every 24 hours.`,
  },
] as const;

/** The publish page: the graph to sign for comes from the server's settings (ADR 0005). */
export default async function PublishPage() {
  await connection();
  const { contextGraph } = getUploadService();
  return (
    <div className="grid items-start gap-8 md:grid-cols-[1fr_1.4fr] md:gap-x-16 md:gap-y-8">
      <div className="grid gap-3 md:col-start-1 md:row-start-1">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Publish a paper</h1>
        <p className="max-w-[48ch] leading-relaxed text-muted">
          Your paper becomes a public record on the DKG, with your wallet as its submitter.
        </p>
      </div>
      <div className="md:col-start-2 md:row-span-2 md:row-start-1">
        <PublishForm
          contextGraph={contextGraph}
          maxBytes={PUBLISH_SETTINGS.maxPdfBytes}
          signatureLifetimeS={UPLOAD_SETTINGS.signatureLifetimeS}
        />
      </div>
      <ul className="grid gap-4 md:col-start-1 md:row-start-2">
        {BEFORE.map(({ icon: Icon, title, body }) => (
          <li key={title} className="grid grid-cols-[2.25rem_1fr] gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
              <Icon size={18} />
            </span>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
