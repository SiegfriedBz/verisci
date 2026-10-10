import { ArrowRight, FilePdf, PenNib, Wallet } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { ProgressChain } from "../components/progress-chain.tsx";

const HOW = [
  {
    icon: Wallet,
    title: "Connect your wallet",
    body: "Your address becomes the submitter on the record.",
  },
  {
    icon: FilePdf,
    title: "Drop your PDF",
    body: "It's stored on IPFS, and we read its title, authors and abstract.",
  },
  {
    icon: PenNib,
    title: "Sign once",
    body: "A free signature, no transaction. We mint the record and pay the fees.",
  },
] as const;

/** Home: what verisci does, and the way to publish. */
export default function Home() {
  return (
    <div className="grid gap-20 sm:gap-28">
      <section className="grid items-center gap-12 md:grid-cols-[1.15fr_1fr] md:gap-16">
        <div className="grid gap-6">
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
            Publish your paper as a record anyone can verify
          </h1>
          <p className="max-w-[48ch] text-lg text-muted">
            Drop a PDF and sign with your wallet. verisci records it on the knowledge graph, with
            you as its submitter.
          </p>
          <Link
            href="/publish"
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-accent px-5 py-3 font-medium text-accent-ink transition active:scale-[0.98]"
          >
            Publish a paper
            <ArrowRight size={18} />
          </Link>
        </div>
        <figure className="grid gap-4 rounded-xl border border-line bg-surface p-6 sm:p-8">
          <figcaption className="text-sm text-muted">Example: a paper being published</figcaption>
          <ProgressChain stage="minting" />
        </figure>
      </section>

      <section className="grid gap-10 md:grid-cols-[1fr_2fr]">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="grid gap-8">
          {HOW.map(({ icon: Icon, title, body }) => (
            <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-4">
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
                <Icon size={20} />
              </span>
              <div>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1 max-w-[52ch] text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
