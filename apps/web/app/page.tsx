import {
  ArrowRight,
  Cube,
  FilePdf,
  Flask,
  Graph,
  PenNib,
  Robot,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
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

const RATE = [
  {
    icon: Robot,
    title: "Phase 1 · Machine score",
    body: "An AI reads the paper and scores it from 0 to 100, with its reasons. This score is recorded on chain.",
  },
  {
    icon: UsersThree,
    title: "Phase 2 · Human review",
    body: "Reviewers read the paper and score it. Their score is recorded next to the machine score, which stays as it was.",
  },
  {
    icon: Flask,
    title: "Phase 3 · Wet-lab replication",
    body: "A lab repeats the experiments, then reviewers check its results. That verdict is recorded as a third score, next to the first two.",
  },
] as const;

const RECORD = [
  ["title", "Attention Is All You Need"],
  ["authors", "Vaswani, Shazeer, Parmar, …"],
  ["pdf", "ipfs://bafybeicrwkcuh…ats642m"],
  ["submitter", "0x7a31…c9f2"],
  ["signature", "0x4be0…1c (EIP-712)"],
] as const;

/** Home: what VeriSci does, the way to publish, and the rating flow to come. */
export default function Home() {
  return (
    <div className="grid gap-24 sm:gap-32">
      <section className="grid items-center gap-14 md:grid-cols-[1.3fr_1fr] md:gap-14">
        <div className="enter grid min-h-[calc(100dvh-9rem)] content-center gap-7 md:min-h-0">
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight md:text-[2.75rem] lg:text-5xl">
            Publish your paper as a record anyone can <span className="text-accent">verify</span>
          </h1>
          <p className="max-w-[46ch] text-lg leading-relaxed text-muted">
            Drop a PDF and sign with your wallet. VeriSci records it on the knowledge graph, with
            you as its submitter.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/publish"
              className="signal-gradient inline-flex w-fit items-center gap-2 rounded-xl px-5 py-3 font-semibold text-accent-ink shadow-[0_8px_30px_rgb(61_220_151/0.25)] transition hover:brightness-110 active:scale-[0.98]"
            >
              Publish a paper
              <ArrowRight size={18} weight="bold" />
            </Link>
            <span
              aria-disabled
              className="inline-flex w-fit cursor-not-allowed items-center gap-2 rounded-xl border border-line px-5 py-3 font-medium text-muted"
            >
              Rate a paper
              <span className="rounded-full bg-surface-strong px-2 py-0.5 text-xs">soon</span>
            </span>
          </div>
        </div>
        <div className="enter-late relative">
          <div aria-hidden className="signal-glow absolute -inset-x-4 -inset-y-10 sm:-inset-10" />
          <figure className="glass relative grid gap-6 rounded-2xl p-6 sm:p-8">
            <figcaption className="flex items-center justify-between gap-3 text-sm text-muted">
              <span>Publish flow</span>
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
            VeriSci publishes each paper on the OriginTrail Decentralized Knowledge Graph (DKG) as a
            Knowledge Asset: a set of linked statements about the paper, with an owner and a proof
            on chain. Its content and its proof live in two places that check each other.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="glass grid content-start gap-4 rounded-2xl p-6">
            <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
              <Graph size={22} />
            </span>
            <div className="grid gap-2">
              <h3 className="font-semibold">The content, off chain</h3>
              <p className="text-sm leading-relaxed text-muted">
                DKG nodes store the asset's statements: title, authors, the PDF's link, the
                submitter and their signature. Several nodes keep a copy, and anyone can query it by
                its UAL, the asset's permanent address.
              </p>
            </div>
          </article>
          <article className="glass grid content-start gap-4 rounded-2xl p-6">
            <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
              <Cube size={22} />
            </span>
            <div className="grid gap-2">
              <h3 className="font-semibold">The owner and the proof, on chain</h3>
              <p className="text-sm leading-relaxed text-muted">
                Publishing mints the asset on Base as an ERC-721 token and anchors the merkle root
                of its statements, one hash computed from all of them. Any node can check that the
                content still matches that root. Only the token's holder can update the asset, and
                each update anchors a new root under the same UAL.
              </p>
            </div>
          </article>
        </div>
        <div className="grid max-w-[62ch] gap-3 text-sm leading-relaxed text-muted">
          <p>
            The UAL is the link between the two: it names the chain, the publisher's address and the
            asset's number, so the same address leads to the content on the graph and to its token
            on Base. The graph makes the record readable and searchable; the chain makes it
            tamper-evident.
          </p>
          <p>
            The token is held by VeriSci's node, which publishes and pays for it. Your claim to the
            paper is your signature inside the asset, covered by the merkle root. The PDF itself
            sits on IPFS, addressed by its CID, a hash of its bytes.
          </p>
        </div>
      </section>

      <section className="grid gap-10">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
        <div className="grid gap-12 md:grid-cols-2 md:gap-10">
          <Track
            label="Publish"
            badge={<span className="text-accent">live</span>}
            intro="Three steps, about two minutes, no gas."
            steps={HOW}
          />
          <Track
            label="Rate"
            badge="coming soon"
            intro="Anyone will be able to ask for a rating of a published paper. Each phase records its own score on chain, so earlier scores stay as they were."
            steps={RATE}
            muted
          />
        </div>
      </section>

      <section className="grid items-center gap-10 md:grid-cols-[1.6fr_1fr] md:gap-16">
        <div className="glass order-2 overflow-hidden rounded-2xl md:order-1">
          <div className="flex items-center justify-between border-b border-line px-5 py-3 text-xs text-muted">
            <span>Paper asset · stored off chain</span>
            <span>Example</span>
          </div>
          <dl className="grid gap-3 p-5 font-mono text-xs sm:text-sm">
            {RECORD.map(([key, value]) => (
              <div key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                <dt className="text-muted">{key}</dt>
                <dd className="truncate text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-1 border-t border-line px-5 py-3 font-mono text-xs">
            <span className="text-muted">address (UAL)</span>
            <span className="truncate text-accent">did:dkg:base:84532/0xd701…/5</span>
          </div>
        </div>
        <div className="order-1 grid content-start gap-3 md:order-2">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            What a paper asset holds
          </h2>
          <p className="max-w-[40ch] leading-relaxed text-muted">
            The statements DKG nodes store for each paper: its details, a permanent link to the PDF,
            and your signature. The merkle root on Base covers all of them, so anyone can check who
            submitted it without trusting us.
          </p>
          <p className="max-w-[40ch] text-sm leading-relaxed text-muted">
            A rating will be a separate asset, with its own UAL, whose statements point to this one.
            The paper asset itself never changes.
          </p>
        </div>
      </section>
    </div>
  );
}

/** One flow of "How it works": its name, a status, a line of context and its steps. */
function Track({
  label,
  badge,
  intro,
  steps,
  muted = false,
}: {
  label: string;
  badge: React.ReactNode;
  intro: string;
  steps: typeof HOW | typeof RATE;
  muted?: boolean;
}) {
  return (
    <div className="grid content-start gap-5">
      <div className="grid gap-2">
        <h3 className="flex items-center gap-3 text-lg font-semibold">
          {label}
          <span className="rounded-full bg-surface-strong px-2.5 py-0.5 font-mono text-xs font-normal text-muted">
            {badge}
          </span>
        </h3>
        <p className="max-w-[52ch] text-sm leading-relaxed text-muted">{intro}</p>
      </div>
      <ol className={`grid gap-4 ${muted ? "opacity-70" : ""}`}>
        {steps.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="glass grid grid-cols-[2.75rem_1fr] items-start gap-4 rounded-2xl p-5"
          >
            <span
              className={`grid size-11 place-items-center rounded-xl ${
                muted ? "bg-surface-strong text-muted" : "bg-accent-soft text-accent"
              }`}
            >
              <Icon size={22} />
            </span>
            <div>
              <h4 className="font-medium">{title}</h4>
              <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
