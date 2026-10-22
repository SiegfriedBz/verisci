import { getRatingService, type PaperRatingSummary, type PaperSummary } from "@labstrail/workflows";
import { ratingChainConfig } from "../rating/chain.ts";
import { createWebEnv } from "../web-env.ts";

/**
 * A paper in a list, with its rating summary for the Score column, and whether a rating can be
 * asked for here (a contract takes ratings).
 */
export type PaperRow = PaperSummary & {
  readonly rating: PaperRatingSummary;
  readonly canRate: boolean;
};

/**
 * The list's papers with their rating summaries, read for the whole page at once by
 * `summaries` (`paperRatingSummaries`), which never waits more than 6 s a paper. With no
 * `summaries` (no contract takes ratings here) every paper is unrated and can't be rated; a
 * read that throws leaves every paper unknown, so the list still renders.
 */
export async function withRatings(
  papers: readonly PaperSummary[],
  summaries: ((uals: readonly string[]) => Promise<readonly PaperRatingSummary[]>) | undefined,
): Promise<PaperRow[]> {
  let ratings: readonly PaperRatingSummary[] | undefined;
  if (summaries) {
    try {
      ratings = await summaries(papers.map((paper) => paper.ual));
    } catch (error) {
      console.error("paper ratings:", error);
      ratings = papers.map(() => ({ kind: "unknown" }));
    }
  }
  return papers.map((paper, index) => ({
    ...paper,
    rating: ratings?.[index] ?? { kind: "unrated" },
    canRate: summaries !== undefined,
  }));
}

/** The page's read of rating summaries, or `undefined` where no contract takes ratings. */
export function ratingSummaries():
  | ((uals: readonly string[]) => Promise<readonly PaperRatingSummary[]>)
  | undefined {
  if (!ratingChainConfig(createWebEnv())) return undefined;
  return (uals) => getRatingService().paperRatingSummaries(uals);
}
