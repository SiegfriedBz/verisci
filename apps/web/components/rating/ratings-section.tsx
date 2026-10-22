import {
  getRatingService,
  type PaperRatingSummary,
  type RatingSummary,
  summariseRatings,
} from "@labstrail/workflows";
import { Flask, Robot, UsersThree } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { formatPublished } from "../../lib/papers/papers.ts";
import { ratingChainConfig } from "../../lib/rating/chain.ts";
import { reviewJsonLd } from "../../lib/seo/json-ld.ts";
import { siteUrl } from "../../lib/seo/site-metadata.ts";
import { SITE } from "../../lib/site.ts";
import { createWebEnv } from "../../lib/web-env.ts";
import { JsonLd } from "../site/json-ld.tsx";
import { RATINGS_TITLE, READINESS_INTRO, READINESS_TITLE } from "./labels.ts";
import { RateButton } from "./rate-button.tsx";
import { ScrollToRating } from "./scroll-to-rating.tsx";

/** The rating phases, as the home page's "How it works" names them: only the first runs. */
const PHASES = [
  { icon: Robot, name: "Reproducibility readiness", status: "live" },
  { icon: UsersThree, name: "Human review", status: "next" },
  { icon: Flask, name: "Wet-lab replication", status: "later" },
] as const;

/**
 * A published paper's ratings, read from the environment's contracts on the server inside the
 * paper page's `Suspense`. Phase 1 leads: its latest score (the contract's, ADR 0014) with a
 * link to its checks, or the paper's state as the papers list words it (`summariseRatings`),
 * and the button that requests a new rating ("Rate again" under a score, ADR 0013), left out
 * for a paper that can't be rated. Every
 * rating follows, newest first, then the three phases. A scored paper's section opens with one
 * sentence that says its latest score, by its `title`, and holds that rating as a `Review` for
 * search engines (ADR 0040). Reads nothing where no contract takes ratings (no deployment, or
 * locally without the Anvil settings). The section is `#rating`, the papers list's Rate link,
 * and scrolls into view when the page was opened at it (`ScrollToRating`).
 */
export async function RatingsSection({
  ual,
  cid,
  title,
}: {
  ual: string;
  cid: string;
  /** The paper's title, for the score's sentence; without it, the sentence is left out. */
  title?: string | undefined;
}) {
  const env = createWebEnv();
  const config = ratingChainConfig(env);
  if (!config) {
    return (
      <Section>
        <p className="text-sm leading-relaxed text-muted">
          Ratings aren't set up here: no rating contract is deployed for this environment.
        </p>
      </Section>
    );
  }
  const list = await getRatingService().listRatings(ual);
  if (!list.ok) {
    return (
      <Section>
        <p role="alert" className="text-sm leading-relaxed text-muted">
          Ratings can't be loaded right now: the chain didn't answer.{" "}
          <Link href={`/papers/${cid}`} className="link">
            Try again
          </Link>
        </p>
      </Section>
    );
  }
  const summary = summariseRatings(list.ratings);
  const newestFirst = [...list.ratings].reverse();
  const latest =
    summary.kind === "scored"
      ? list.ratings.find((rating) => rating.requestId === summary.requestId)
      : undefined;
  return (
    <Section>
      {summary.kind === "scored" && (
        <>
          <JsonLd
            data={reviewJsonLd(siteUrl(env), cid, {
              requestId: summary.requestId,
              score: summary.score,
              ...(latest?.rKaUal ? { rKaUal: latest.rKaUal } : {}),
            })}
          />
          {title && (
            <p data-testid="score-sentence" className="max-w-[65ch] text-sm leading-relaxed">
              {title} scores {summary.score}/100 for reproducibility readiness on {SITE.name}.{" "}
              <Link href="/method" className="link">
                How the score works
              </Link>
            </p>
          )}
        </>
      )}
      <div
        className={`grid gap-8 ${newestFirst.length > 0 ? "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-10" : ""}`}
      >
        <div className="grid content-start gap-5">
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold">{READINESS_TITLE}</h3>
            <p className="max-w-[60ch] text-sm leading-relaxed text-muted">{READINESS_INTRO}</p>
          </div>
          <Current summary={summary} ratings={list.ratings} cid={cid} />
          {summary.kind !== "cannot-rate" && (
            <div className="grid gap-2">
              <RateButton
                ual={ual}
                cid={cid}
                config={config}
                label={summary.kind === "scored" ? "Rate again" : "Rate this paper"}
              />
              <p className="text-xs leading-relaxed text-muted">
                {summary.kind === "scored" &&
                  "A new rating adds its own score, and the latest one shows here. "}
                {config.local
                  ? "Local mode: requests go to the Anvil chain on this computer."
                  : "Free on testnet: you pay only gas. A wallet can have 3 ratings waiting at a time."}
              </p>
            </div>
          )}
        </div>
        {newestFirst.length > 0 && (
          <div className="grid content-start gap-2">
            <h3 className="text-sm font-semibold">History</h3>
            <ol
              aria-label="Rating history"
              className="grid divide-y divide-line rounded-xl border border-line"
            >
              {newestFirst.map((rating) => (
                <RatingRow key={rating.requestId} rating={rating} cid={cid} />
              ))}
            </ol>
          </div>
        )}
      </div>
      <ol
        aria-label="Rating phases"
        className="grid gap-4 border-t border-line pt-5 sm:grid-cols-3"
      >
        {PHASES.map(({ icon: Icon, name, status }) => (
          <li key={name} className="flex items-center gap-3">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-lg border ${
                status === "live"
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-line bg-surface text-muted"
              }`}
            >
              <Icon aria-hidden size={18} />
            </span>
            <span className="grid">
              <span className="text-sm font-medium">{name}</span>
              <span className={`text-xs ${status === "live" ? "text-accent" : "text-muted"}`}>
                {status}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section
      id="rating"
      aria-labelledby="rating-title"
      className="glass enter grid scroll-mt-24 gap-6 rounded-2xl p-5 sm:p-6"
    >
      <h2 id="rating-title" className="text-lg font-semibold">
        {RATINGS_TITLE}
      </h2>
      {children}
      <ScrollToRating />
    </section>
  );
}

/** Phase 1 now: the latest score, a rating under way, or why there is none. */
function Current({
  summary,
  ratings,
  cid,
}: {
  summary: Exclude<PaperRatingSummary, { kind: "unknown" }>;
  ratings: readonly RatingSummary[];
  cid: string;
}) {
  const pageOf = (requestId: string) => `/papers/${cid}/ratings/${requestId}`;
  const dayOf = (rating: RatingSummary | undefined) =>
    rating ? formatPublished(new Date(rating.requestedAt * 1000).toISOString()) : "";
  switch (summary.kind) {
    case "scored": {
      const scored = ratings.find((rating) => rating.requestId === summary.requestId);
      return (
        <div className="grid gap-1">
          <p className="flex items-baseline gap-2">
            <span
              data-testid="latest-score"
              className="font-mono text-5xl font-semibold tracking-tight text-accent-2"
            >
              {summary.score}
            </span>
            <span className="text-sm text-muted">/ 100</span>
          </p>
          <p className="text-sm text-muted">
            The latest score on chain, from the rating requested {dayOf(scored)}.{" "}
            <Link href={pageOf(summary.requestId)} className="link">
              Read the checks
            </Link>
          </p>
        </div>
      );
    }
    case "pending": {
      const pending = ratings.filter((rating) => rating.status === "pending").at(-1);
      return (
        <div className="grid gap-1">
          <p data-testid="rating-state" className="text-lg font-semibold">
            Rating in progress
          </p>
          {pending && (
            <p className="text-sm text-muted">
              Requested {dayOf(pending)}.{" "}
              <Link href={pageOf(pending.requestId)} className="link">
                Follow it
              </Link>
            </p>
          )}
        </div>
      );
    }
    case "cannot-rate":
      return (
        <div className="grid gap-1">
          <p data-testid="rating-state" className="text-lg font-semibold">
            Can't be rated
          </p>
          <p className="max-w-[60ch] text-sm leading-relaxed text-muted">
            A request for this paper was cancelled because it can't be rated, so a rating can't be
            asked for again. Its details say why.
          </p>
        </div>
      );
    case "unrated":
      return (
        <div className="grid gap-1">
          <p data-testid="rating-state" className="text-lg font-semibold">
            Not rated yet
          </p>
          <p className="max-w-[60ch] text-sm leading-relaxed text-muted">
            An AI model checks the paper against the checklist for its kind of study, quoting the
            paper for each answer, and the score is recorded on chain. It usually takes a few
            minutes.
          </p>
        </div>
      );
  }
}

/** One rating in the history: its day, its outcome, and a link to its page. */
function RatingRow({ rating, cid }: { rating: RatingSummary; cid: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
      <span className="text-muted">
        {formatPublished(new Date(rating.requestedAt * 1000).toISOString())}
      </span>
      {rating.status === "fulfilled" ? (
        <span>
          Scored <span className="font-mono font-semibold text-accent-2">{rating.score}</span>
        </span>
      ) : (
        <span className="text-muted">
          {rating.status === "pending"
            ? "In progress"
            : rating.cancelReason === "invalid-target"
              ? "Can't be rated"
              : "Couldn't finish in a day"}
        </span>
      )}
      <Link href={`/papers/${cid}/ratings/${rating.requestId}`} className="link">
        Details
      </Link>
    </li>
  );
}
