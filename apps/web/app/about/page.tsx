import {
  ArrowSquareOut,
  Cube,
  FilePdf,
  GithubLogo,
  Graph,
  LinkedinLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "../../lib/site.ts";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why LabsTrail exists, how it records life-science papers and their quality ratings off-chain on the OriginTrail DKG and on-chain on Base, with each PDF on IPFS, and who builds it.",
  alternates: { canonical: "/about" },
};

/**
 * OriginTrail's two layers: where each part of a Knowledge Asset lives. Blue marks off-chain
 * records and teal on-chain ones, as everywhere on the site.
 */
const LAYERS = [
  {
    icon: Graph,
    line: "border-accent",
    tone: "text-accent",
    title: "The graph, off-chain",
    body: "DKG nodes store each asset's statements and replicate them across the nodes that follow its graph. People and AI agents read them by the asset's permanent address, its UAL, or query them with SPARQL.",
  },
  {
    icon: Cube,
    line: "border-accent-2",
    tone: "text-accent-2",
    title: "The proof, on-chain",
    body: "Publishing mints the asset on Base as an ERC-721 token and anchors the merkle root of its statements, one hash computed from all of them. Anyone can check that the statements still match it, and only the token's holder can add a new version.",
  },
] as const;

/**
 * What comes after transparent human review, the next step, in order, each with why it matters
 * (ADR 0015's payment plan before mainnet, ADR 0010's second copy of each PDF, ADR 0012's third
 * phase). No dates.
 */
const NEXT = [
  {
    name: "Payment, for people and AI agents",
    status: "planned",
    why: "Today a requester pays only their gas, LabsTrail pays the rest, and caps hold spam back. The plan, not decided yet: a fee on publishing and on rating that a person or an AI agent can pay, covering the costs and the reviewers' pay.",
  },
  {
    name: "An API for AI agents",
    status: "planned",
    why: "Agents will read papers and ratings, and ask for a rating, without going through this website.",
  },
  {
    name: "A lasting, decentralized copy of every paper",
    status: "planned",
    why: "One pinning service holds each PDF on IPFS today. Its hash proves the file is unchanged, but only more copies keep it available, so the plan is to store each paper on a decentralized storage network too, before mainnet.",
  },
  {
    name: "Wet-lab replication",
    status: "later",
    why: "A lab repeats the experiments, and reviewers check its results before they are scored.",
  },
] as const;

/**
 * Why LabsTrail exists, how it uses the OriginTrail DKG, Base and IPFS to record papers and
 * their ratings as Knowledge Assets, what comes next, and who builds it, with the code and the maintainer's
 * profile (ADR 0040).
 */
export default function AboutPage() {
  return (
    <div className="grid gap-14 md:gap-20">
      <header className="grid max-w-[65ch] gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">About {SITE.name}</h1>
        <p className="text-lg leading-relaxed text-muted">{SITE.definition}</p>
        <Link href="/method" className="link w-fit">
          How the score works
        </Link>
      </header>

      <section aria-labelledby="why-title" className="grid max-w-[65ch] gap-4">
        <h2 id="why-title" className="text-xl font-semibold tracking-tight">
          Why LabsTrail exists
        </h2>
        <p className="leading-relaxed text-muted">
          Many published results can't be repeated. In a 2016 <cite>Nature</cite> survey of more
          than 1,500 researchers, more than 70% had tried and failed to reproduce another
          scientist's experiments (Baker, <cite>Nature</cite> 533, 452-454).
        </p>
        <p className="leading-relaxed text-muted">
          Yet how far to trust a paper is still judged mostly by the journal it appeared in, and the
          reviews behind that judgement are rarely public. The link to a paper's file can also
          change or break after others have cited it.
        </p>
        <p className="leading-relaxed text-muted">
          AI agents now read, cite and build on research at a scale no person can. They have no
          better way to tell a paper that gives enough to be repeated from one that doesn't.
        </p>
        <p className="leading-relaxed text-ink">
          LabsTrail gives each paper a record whose provenance anyone can check, then rates its
          quality in the open: a machine reproducibility score first, then transparent human review.
          The paper and each of its ratings are recorded off-chain and on-chain, where people and
          agents can read and check them.
        </p>
      </section>

      <section aria-labelledby="dkg-title" className="grid gap-8">
        <div className="grid max-w-[65ch] gap-3">
          <h2 id="dkg-title" className="text-xl font-semibold tracking-tight">
            Built on the OriginTrail DKG
          </h2>
          <p className="leading-relaxed text-muted">
            OriginTrail's Decentralized Knowledge Graph (DKG) is an open network of nodes that store
            knowledge as Knowledge Assets: sets of linked statements, each with a permanent address,
            an owner and a proof on a blockchain. An asset lives in two layers that check each
            other.
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-2 md:gap-14">
          {LAYERS.map(({ icon: Icon, line, tone, title, body }) => (
            <article key={title} className={`grid content-start gap-2 border-l-2 pl-5 ${line}`}>
              <h3 className="flex items-center gap-2 font-semibold">
                <Icon aria-hidden size={20} className={`shrink-0 ${tone}`} />
                {title}
              </h3>
              <p className="max-w-[56ch] text-sm leading-relaxed text-muted">{body}</p>
            </article>
          ))}
        </div>
        <div className="grid gap-4 rounded-2xl border border-line p-5 sm:grid-cols-[auto_1fr] sm:gap-5 sm:p-6">
          <span className="grid size-10 place-items-center rounded-full border border-accent/40 bg-accent-soft text-accent">
            <FilePdf aria-hidden size={20} />
          </span>
          <div className="grid gap-2">
            <h3 className="font-semibold">The paper itself, on IPFS</h3>
            <p className="max-w-[75ch] text-sm leading-relaxed text-muted">
              IPFS is a decentralized storage network that addresses each file by its CID, a hash of
              its content. The paper's PDF is stored there, off-chain, and its asset links that CID.
              A changed file would get another CID, so the link always leads to the file the
              submitter signed, and no one can swap it unnoticed.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="assets-title" className="grid gap-6">
        <h2 id="assets-title" className="text-xl font-semibold tracking-tight">
          Papers and ratings are Knowledge Assets
        </h2>
        <div className="grid gap-8 md:grid-cols-2 md:gap-14">
          <div className="grid content-start gap-3">
            <h3 className="font-medium">A paper</h3>
            <p className="max-w-[56ch] text-sm leading-relaxed text-muted">
              Its asset gives the title, the authors and the PDF's CID, with the submitter's address
              and their signature of that CID. Anyone can check who submitted which file without
              trusting LabsTrail.
            </p>
          </div>
          <div className="grid content-start gap-3">
            <h3 className="font-medium">A rating</h3>
            <p className="max-w-[56ch] text-sm leading-relaxed text-muted">
              Each rating is an asset of its own that points to the paper's, with every check,
              answer and quote behind its score. LabsTrail's RatingController contract on Base
              records the score. A new rating or review adds its own score, and the paper's asset
              and earlier scores stay as they were.
            </p>
          </div>
        </div>
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted">
          LabsTrail's node mints both kinds of asset, holds their tokens and pays their fees, so
          only LabsTrail can add a version to them. The rating grows in three phases, from a machine
          score for reproducibility readiness to wet-lab replication.
        </p>
      </section>

      <section aria-labelledby="next-title" className="grid gap-6">
        <h2 id="next-title" className="text-xl font-semibold tracking-tight">
          What comes next
        </h2>
        <ol className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
          <li className="glass grid gap-6 rounded-2xl p-6 sm:col-span-2 sm:p-8 lg:grid-cols-[16rem_1fr] lg:gap-12">
            <div className="grid content-start gap-1.5">
              <span className="w-fit rounded-md bg-surface-strong px-2 py-0.5 font-mono text-xs text-accent">
                next
              </span>
              <h3 className="text-lg font-semibold">Transparent human review</h3>
            </div>
            <div className="grid max-w-[65ch] gap-3 text-sm leading-relaxed text-muted">
              <p>
                A machine can check what a paper reports, not whether its content holds up. That
                takes people, and in traditional peer review, who reviews a paper is decided behind
                closed doors.
              </p>
              <p>
                LabsTrail will draw reviewers at random with Chainlink VRF, which delivers each
                random number with a proof checked on-chain, so no one, LabsTrail included, can
                steer who is picked, and anyone can check the draw. The reviewers' scores join the
                paper's rating record, off-chain and on-chain.
              </p>
              <p>
                The plan, not decided yet: reviewers stake to join the pool, are paid for their
                reviews, and lose part of their stake if they review in bad faith.
              </p>
            </div>
          </li>
          {NEXT.map(({ name, status, why }) => (
            <li key={name} className="grid content-start gap-1.5">
              <span
                className={`w-fit rounded-md bg-surface-strong px-2 py-0.5 font-mono text-xs ${
                  status === "later" ? "text-muted" : "text-ink"
                }`}
              >
                {status}
              </span>
              <h3 className="font-medium">{name}</h3>
              <p className="max-w-[60ch] text-sm leading-relaxed text-muted">{why}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="who-title" className="grid gap-8 md:grid-cols-[1fr_1fr] md:gap-14">
        <div className="grid content-start gap-4">
          <h2 id="who-title" className="text-xl font-semibold tracking-tight">
            Who builds it
          </h2>
          <p className="max-w-[56ch] leading-relaxed text-muted">
            {SITE.maintainer.name} builds and runs {SITE.name}.
          </p>
          <ul className="grid gap-3 text-sm">
            <li>
              <a
                href={SITE.repo}
                target="_blank"
                rel="noreferrer"
                className="link inline-flex items-center gap-2"
              >
                <GithubLogo aria-hidden size={18} />
                Source code on GitHub
                <ArrowSquareOut aria-hidden size={12} />
              </a>
            </li>
            <li>
              <a
                href={SITE.maintainer.linkedIn}
                target="_blank"
                rel="noreferrer"
                className="link inline-flex items-center gap-2"
              >
                <LinkedinLogo aria-hidden size={18} />
                Profile on LinkedIn
                <ArrowSquareOut aria-hidden size={12} />
              </a>
            </li>
          </ul>
        </div>
        <div className="grid content-start gap-4">
          <h2 className="text-xl font-semibold tracking-tight">On testnets for now</h2>
          <p className="max-w-[56ch] text-sm leading-relaxed text-muted">
            Everything runs on Base Sepolia, a testnet, until a payment plan is in place; then
            LabsTrail moves to mainnet. Until then a requester pays only their gas, and LabsTrail
            pays to publish and to rate.
          </p>
          <p className="max-w-[56ch] text-sm leading-relaxed text-muted">
            Visits are counted with Vercel Web Analytics, which sets no cookies.
          </p>
        </div>
      </section>
    </div>
  );
}
