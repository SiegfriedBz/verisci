import type { RatingView } from "@labstrail/workflows";
import { Warning } from "@phosphor-icons/react";
import { addressUrl, assetTokenUrl } from "../../lib/papers/explorer.ts";
import { answerLabel, type CheckRow, checkRows, studyTypeLine } from "../../lib/rating/checks.ts";
import { CopyValue } from "../paper/copy-value.tsx";

const ANSWER_TONE = {
  shown: "bg-accent-soft text-accent",
  partly: "bg-surface-strong text-ink",
  missing: "bg-danger-soft text-danger",
  "not-applicable": "bg-surface-strong text-muted",
} as const;

/**
 * A scored rating: the contract's score (ADR 0014), flagged when its R-KA records another;
 * then the R-KA's content, read from the DKG: the study type, the rationale, each check with
 * its answer and quote, and for a check that lost its point what the scorer claimed and why it
 * didn't count; where the R-KA and the request live.
 */
export function RatingDetail({
  view,
  local,
}: {
  view: Extract<RatingView, { ok: true }>;
  /** True on Anvil, which no block explorer shows. */
  local: boolean;
}) {
  const { rating, record } = view;
  const tokenUrl = rating.rKaUal ? assetTokenUrl(rating.rKaUal) : undefined;
  return (
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-12">
      <div className="grid content-start gap-6">
        {record ? (
          <>
            {studyTypeLine(record.studyType) && (
              <p className="text-sm text-muted">{studyTypeLine(record.studyType)}</p>
            )}
            <p className="max-w-[65ch] leading-relaxed">{record.rationale}</p>
            {record.textShortened && (
              <p className="max-w-[65ch] rounded-xl border border-line px-4 py-3 text-sm leading-relaxed text-muted">
                The paper's text was shortened to fit the scorer, so its end may not have been read.
                A statement there, such as funding or competing interests, may have lost its point.
              </p>
            )}
            {record.checks.length > 0 && (
              <ol className="grid divide-y divide-line rounded-2xl border border-line">
                {checkRows(record.checks).map((row) => (
                  <CheckItem key={row.id} row={row} />
                ))}
              </ol>
            )}
          </>
        ) : (
          <p role="status" className="max-w-[65ch] leading-relaxed text-muted">
            {view.recordProblem === "unavailable"
              ? "The checks can't be loaded right now: the DKG node didn't answer. Reload the page to try again."
              : "The rating's checks can't be read from the DKG. The score above is the one recorded on chain."}
          </p>
        )}
      </div>
      <aside className="glass grid content-start gap-5 rounded-2xl p-5 sm:p-6">
        <div className="grid gap-1">
          <p className="flex items-baseline gap-2">
            <span
              data-testid="rating-score"
              className="font-mono text-6xl font-semibold tracking-tight text-accent-2"
            >
              {rating.score}
            </span>
            <span className="text-sm text-muted">/ 100</span>
          </p>
          <p className="text-sm text-muted">Recorded on the rating contract</p>
        </div>
        {view.gap && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
            The R-KA records a different score. The contract's score is the one that counts.
          </p>
        )}
        <dl className="grid gap-5">
          {record && (
            <div className="grid gap-1">
              <dt className="text-sm text-muted">Scored by</dt>
              <dd className="font-mono text-sm">
                {record.model}, scorer version {record.promptVersion}
              </dd>
            </div>
          )}
          {rating.rKaUal && (
            <CopyValue
              label="Rating asset (R-KA)"
              value={rating.rKaUal}
              head={22}
              href={tokenUrl}
            />
          )}
          <CopyValue
            label="Rating contract"
            value={rating.contract}
            href={local ? undefined : addressUrl(rating.contract)}
          />
          <CopyValue label="Request id" value={rating.requestId} />
        </dl>
      </aside>
    </div>
  );
}

/** One check: what it asks, its answer and the paper's words, or why it lost its point. */
function CheckItem({ row }: { row: CheckRow }) {
  return (
    <li className="grid gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 leading-relaxed">{row.question}</p>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${ANSWER_TONE[row.answer]}`}
        >
          {answerLabel(row.answer)}
        </span>
      </div>
      {row.quote && (
        <blockquote className="border-l-2 border-accent/50 pl-3 text-sm leading-relaxed text-muted">
          “{row.quote}”
        </blockquote>
      )}
      {row.lost && (
        <div className="grid gap-2 rounded-xl border border-line px-3 py-3 text-sm leading-relaxed">
          <p className="font-medium">The scorer claimed: {answerLabel(row.lost.claimed)}</p>
          {row.lost.quote && <blockquote className="text-muted">“{row.lost.quote}”</blockquote>}
          <p className="text-muted">{row.lost.why}</p>
        </div>
      )}
    </li>
  );
}
