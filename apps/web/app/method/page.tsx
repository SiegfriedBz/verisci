import { checklistOf, STUDY_TYPES } from "@labstrail/core";
import { RATING_SETTINGS } from "@labstrail/workflows";
import { Flask, Robot, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How the score works",
  description:
    "How LabsTrail rates a life-science paper's reproducibility readiness: the checklist for each kind of study, the model, how its answers become a score from 0 to 100, and what the score leaves out.",
  alternates: { canonical: "/method" },
};

const STEPS = [
  {
    title: "The model reads the paper",
    body: (
      <>
        The rating fetches the paper's PDF from IPFS by its CID, the one the submitter signed.{" "}
        <span className="font-mono text-ink">{RATING_SETTINGS.model}</span> reads its text and
        decides which kind of study it is.
      </>
    ),
  },
  {
    title: "It answers each check with a quote",
    body: "For every check on that study's checklist, it answers shown, partly or missing, and quotes the passage it relied on.",
  },
  {
    title: "Code counts the points",
    body: "A check the paper shows earns a point, one it partly shows half a point, a missing one none, and an answer counts only when its quote is found in the paper's text. The score is the points over the checks that apply, out of 100.",
  },
] as const;

const LIMITS = [
  "A made-up paper that states every right thing would score well.",
  "The model can misread a paper. Each answer and its quote are on the rating's page, so you can check them.",
  "A very long paper is shortened to fit the model, and its rating's page says so.",
] as const;

const PHASES = [
  {
    icon: Robot,
    name: "Reproducibility readiness",
    status: "live",
    body: "The score on this page, from an AI model against the checklist for the paper's kind of study.",
  },
  {
    icon: UsersThree,
    name: "Human review",
    status: "next",
    body: "Reviewers drawn at random with Chainlink VRF, so anyone can check the draw, read the paper and score it. Their scores join the rating's record, in the open.",
  },
  {
    icon: Flask,
    name: "Wet-lab replication",
    status: "later",
    body: "A lab repeats the experiments, then reviewers check its results.",
  },
] as const;

/** A study type's label as a list item starts it: "a randomized…" becomes "A randomized…". */
const capitalised = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);

/**
 * How the reproducibility readiness score works, for readers and AI search to cite: what it
 * measures, how the model's answers become a score (ADR 0018), the checklist for each kind of
 * study (core's `STUDY_TYPES`, with the scorer's model from `RATING_SETTINGS`), what the
 * score leaves out, where it is recorded, and the three phases (ADR 0012).
 */
export default function MethodPage() {
  return (
    <div className="grid gap-14 md:gap-20">
      <header className="grid max-w-[65ch] gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          How the reproducibility score works
        </h1>
        <p className="text-lg leading-relaxed text-muted">
          Each rating asks whether a paper reports what others would need to repeat its work. The
          score runs from 0 to 100, and it doesn't say whether the findings are right.
        </p>
        <p className="leading-relaxed text-muted">
          LabsTrail takes papers in biology, medicine and health. A paper outside the field is
          refused before it is published, and a rating asked for one is cancelled.
        </p>
      </header>

      <section aria-labelledby="scoring-title" className="grid gap-6">
        <h2 id="scoring-title" className="text-xl font-semibold tracking-tight">
          How a paper is scored
        </h2>
        <ol className="grid gap-6 md:grid-cols-3 md:gap-10">
          {STEPS.map(({ title, body }, index) => (
            <li key={title} className="grid content-start gap-2 border-l-2 border-accent pl-5">
              <span className="font-mono text-xs text-muted">{index + 1}</span>
              <h3 className="font-medium">{title}</h3>
              <p className="max-w-[52ch] text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="checklists-title" className="grid gap-6">
        <div className="grid max-w-[65ch] gap-3">
          <h2 id="checklists-title" className="text-xl font-semibold tracking-tight">
            A checklist for each kind of study
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            The checks are written in our own words from CONSORT 2025, STROBE, ARRIVE 2.0, MDAR,
            PRISMA 2020, SANRA and the DOME recommendations. How strictly each check applies to a
            kind of study follows the Rigor and Transparency Index (Menke and colleagues, iScience
            2020).
          </p>
        </div>
        <ul className="glass grid overflow-hidden rounded-2xl sm:grid-cols-2">
          {STUDY_TYPES.map((type) => (
            <li
              key={type.id}
              className="grid content-start gap-1.5 border-line px-5 py-4 not-last:border-b sm:odd:border-r sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
            >
              <span className="text-sm leading-relaxed">{capitalised(type.label)}</span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="rounded-md bg-surface-strong px-1.5 py-0.5 font-mono text-ink">
                  {type.source === "none" ? "General checks" : type.source}
                </span>
                {checklistOf(type.id).length} checks
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="limits-title"
        className="grid gap-8 md:grid-cols-[1fr_1fr] md:gap-14"
      >
        <div className="grid content-start gap-4">
          <h2 id="limits-title" className="text-xl font-semibold tracking-tight">
            What the score leaves out
          </h2>
          <ul className="grid gap-3">
            {LIMITS.map((limit) => (
              <li key={limit} className="max-w-[56ch] text-sm leading-relaxed text-muted">
                {limit}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Where it is recorded</h2>
          <p className="max-w-[56ch] text-sm leading-relaxed text-muted">
            The score goes on Base, in LabsTrail's RatingController contract. The answers and quotes
            go in the rating's own Knowledge Asset on the OriginTrail DKG, which points to the
            paper's. Like the paper's, the rating's statements are anchored on Base by their merkle
            root, so anyone can read them and check they haven't changed since. The paper's asset
            never changes: a new rating adds its own score, and the paper's page shows the latest.
          </p>
        </div>
      </section>

      <section aria-labelledby="phases-title" className="grid gap-6">
        <div className="grid max-w-[65ch] gap-3">
          <h2 id="phases-title" className="text-xl font-semibold tracking-tight">
            Three phases, three scores
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            Each phase records its own score next to the earlier ones, which stay as they were.
          </p>
        </div>
        <ol className="grid gap-6">
          {PHASES.map(({ icon: Icon, name, status, body }) => (
            <li key={name} className="grid grid-cols-[2.5rem_1fr] items-start gap-4">
              <span
                className={`grid size-10 place-items-center rounded-full border ${
                  status === "live"
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : "border-line-strong bg-page text-muted"
                }`}
              >
                <Icon size={18} />
              </span>
              <div className="grid gap-1 pt-1.5">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium">{name}</h3>
                  <span
                    className={`rounded-md bg-surface-strong px-2 py-0.5 font-mono text-xs ${
                      status === "live" ? "text-accent" : "text-muted"
                    }`}
                  >
                    {status}
                  </span>
                </div>
                <p className="max-w-[60ch] text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link href="/papers" className="link w-fit text-sm">
          Pick a paper to rate
        </Link>
      </section>
    </div>
  );
}
