import { ArrowRight, Cube, FilePdf, Graph, PenNib, Wallet } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { ChainDemo } from "../components/chain-demo.tsx";

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
    body: "Signing is free and sends no transaction. We mint the record and pay its fees.",
  },
] as const;

const RECORD = [
  ["title", "Attention Is All You Need"],
  ["authors", "Vaswani, Shazeer, Parmar, …"],
  ["pdf", "ipfs://bafybeicrwkcuh…ats642m"],
  ["submitter", "0x7a31…c9f2"],
  ["signature", "0x4be0…1c (EIP-712)"],
  ["ual", "did:dkg:base:84532/0xd701…/5"],
] as const;

/** Home: what verisci does, and the way to publish. */
export default function Home() {
  return (
    <div className="grid gap-24 sm:gap-32">
      <section className="grid items-center gap-14 md:grid-cols-[1.3fr_1fr] md:gap-14">
        <div className="enter grid min-h-[calc(100dvh-9rem)] content-center gap-7 md:min-h-0">
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight md:text-[2.75rem] lg:text-5xl">
            Publish your paper as a record anyone can <span className="text-accent">verify</span>
          </h1>
          <p className="max-w-[46ch] text-lg leading-relaxed text-muted">
            Drop a PDF and sign with your wallet. verisci records it on the knowledge graph, with
            you as its submitter.
          </p>
          <Link
            href="/publish"
            className="signal-gradient inline-flex w-fit items-center gap-2 rounded-xl px-5 py-3 font-semibold text-accent-ink shadow-[0_8px_30px_rgb(61_220_151/0.25)] transition hover:brightness-110 active:scale-[0.98]"
          >
            Publish a paper
            <ArrowRight size={18} weight="bold" />
          </Link>
        </div>
        <div className="enter-late relative">
          <div aria-hidden className="signal-glow absolute -inset-10" />
          <figure className="glass relative grid gap-6 rounded-2xl p-6 sm:p-8">
            <figcaption className="flex items-center justify-between gap-3 text-sm text-muted">
              <span>Example: a paper being published</span>
              <span className="font-mono text-xs text-accent">live</span>
            </figcaption>
            <ChainDemo />
          </figure>
        </div>
      </section>

      <section className="grid gap-8">
        <div className="grid max-w-[62ch] gap-3">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Two layers, one record
          </h2>
          <p className="leading-relaxed text-muted">
            verisci publishes on the OriginTrail Decentralized Knowledge Graph (DKG). Each record
            lives in two places that check each other.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="glass grid content-start gap-4 rounded-2xl p-6">
            <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
              <Graph size={22} />
            </span>
            <div className="grid gap-2">
              <h3 className="font-semibold">The knowledge graph, off chain</h3>
              <p className="text-sm leading-relaxed text-muted">
                DKG nodes hold the record itself: title, authors, the PDF's link, the submitter and
                their signature. Several nodes keep a copy, and anyone can query it by its UAL, the
                record's permanent address.
              </p>
            </div>
          </article>
          <article className="glass grid content-start gap-4 rounded-2xl p-6">
            <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
              <Cube size={22} />
            </span>
            <div className="grid gap-2">
              <h3 className="font-semibold">The blockchain, on chain</h3>
              <p className="text-sm leading-relaxed text-muted">
                The record's fingerprint is minted on Base as a token. That proves the record
                existed at that moment, and any later change to it would no longer match.
              </p>
            </div>
          </article>
        </div>
        <p className="max-w-[62ch] text-sm leading-relaxed text-muted">
          The graph makes the record readable and searchable. The chain makes it tamper-evident. The
          PDF itself sits on IPFS, addressed by a hash of its bytes.
        </p>
      </section>

      <section className="grid gap-10 md:grid-cols-[1fr_1.6fr] md:gap-16">
        <div className="grid content-start gap-3">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
          <p className="max-w-[40ch] text-muted">Three steps, about two minutes, no gas.</p>
        </div>
        <ol className="grid gap-4">
          {HOW.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="glass grid grid-cols-[2.75rem_1fr] items-start gap-4 rounded-2xl p-5"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
                <Icon size={22} />
              </span>
              <div>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid items-center gap-10 md:grid-cols-[1.6fr_1fr] md:gap-16">
        <div className="glass order-2 overflow-hidden rounded-2xl md:order-1">
          <div className="flex items-center justify-between border-b border-line px-5 py-3 text-xs text-muted">
            <span className="font-mono">target-ka.json</span>
            <span>Example record</span>
          </div>
          <dl className="grid gap-3 p-5 font-mono text-xs sm:text-sm">
            {RECORD.map(([key, value]) => (
              <div key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                <dt className="text-muted">{key}</dt>
                <dd className="truncate text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="order-1 grid content-start gap-3 md:order-2">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            What the record holds
          </h2>
          <p className="max-w-[40ch] leading-relaxed text-muted">
            The paper's details, a permanent link to the PDF, and your signature. Anyone can check
            who submitted it without trusting us.
          </p>
        </div>
      </section>
    </div>
  );
}
