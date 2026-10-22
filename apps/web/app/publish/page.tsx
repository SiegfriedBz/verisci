import { getUploadService, PUBLISH_SETTINGS, UPLOAD_SETTINGS } from "@labstrail/workflows";
import { Eye, Gauge, Heartbeat, PenNib, Repeat } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PublishForm } from "../../components/publish/publish-form.tsx";
import { UPLOAD_LIMITS } from "../../lib/publish/limits.ts";

export const metadata: Metadata = {
  title: "Publish a paper",
  description:
    "Drop the PDF of a life-science or health paper and sign with your wallet to publish it as a verifiable record.",
};

const BEFORE = [
  {
    icon: Heartbeat,
    title: "Life sciences and health only",
    body: "Biology, medicine, neuroscience, pharmacology, public health and bioinformatics, and psychology when the study is about health. After you sign, an AI model reads the title, the abstract and the start of the text, and a paper our check places outside the field is refused before anything is recorded.",
  },
  {
    icon: Eye,
    title: "Your PDF becomes public",
    body: "It's stored on IPFS, where anyone can download it. Publish your own work, or a paper you're allowed to share, such as an open-access one.",
  },
  {
    icon: PenNib,
    title: "You sign, you don't pay",
    body: "Your wallet signs the PDF's fingerprint (its CID), LabsTrail's graph and a 10-minute deadline. Signing sends no transaction, so it costs no gas.",
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
    <div className="grid gap-14 md:gap-20">
      <div className="grid items-center gap-8 md:grid-cols-[1fr_1.3fr] md:gap-16">
        <div className="grid gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Publish a paper</h1>
          <p className="max-w-[48ch] leading-relaxed text-muted">
            Your paper becomes a public record on the DKG, with your wallet as its submitter.
            LabsTrail takes papers in the life sciences and health only.
          </p>
        </div>
        <PublishForm
          contextGraph={contextGraph}
          maxBytes={PUBLISH_SETTINGS.maxPdfBytes}
          signatureLifetimeS={UPLOAD_SETTINGS.signatureLifetimeS}
        />
      </div>
      <section aria-labelledby="before-title" className="grid gap-5">
        <h2 id="before-title" className="text-xl font-semibold tracking-tight">
          What publishing means
        </h2>
        <ul className="grid gap-x-12 gap-y-7 sm:grid-cols-2">
          {BEFORE.map(({ icon: Icon, title, body }) => (
            <li key={title} className="grid grid-cols-[1.25rem_1fr] content-start gap-x-3">
              <Icon size={20} className="mt-px text-muted" />
              <div>
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="mt-1 max-w-[56ch] text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
