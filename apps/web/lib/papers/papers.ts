import type { PaperListResult, PaperSummary, SignatureCheck } from "@labstrail/workflows";

/** Papers on each page of `/papers`. */
export const PAPERS_PER_PAGE = 20;
/** Papers in the home page's "Latest papers". */
export const LATEST_PAPERS = 5;

/** What `/papers` shows for a page, from `listPapers`' result. */
export type PapersView =
  | {
      readonly kind: "list";
      readonly papers: readonly PaperSummary[];
      readonly total: number;
      readonly page: number;
      readonly lastPage: number;
    }
  | { readonly kind: "empty" | "not-found" | "unavailable" | "unreadable" };

/** One link in the pager: a page number, or a gap between distant pages. */
export type PageLink = number | "gap";

const PAGE = /^[1-9]\d*$/;
/** Up to this many pages, the pager shows every number. */
const ALL_PAGES = 7;
const PUBLISHED_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * The page `?page=` asks for: 1 when absent, a positive whole number in its one spelling,
 * or `undefined` for anything else, a repeated `page` included, or a page so far out that
 * page × `PAPERS_PER_PAGE` is past `Number.MAX_SAFE_INTEGER`, so the offset `listPapers`
 * computes is always a safe integer (the page answers 404).
 */
export function parsePageParam(value: string | string[] | undefined): number | undefined {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !PAGE.test(value)) return undefined;
  const page = Number(value);
  return Number.isSafeInteger(page * PAPERS_PER_PAGE) ? page : undefined;
}

/** How many pages `total` papers fill, at least one. */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/**
 * The pager's numbers: none for a single page, every one up to 7 pages, else the first, the
 * last and the current page with its neighbours, with a gap where numbers are skipped.
 */
export function pageLinks(current: number, last: number): PageLink[] {
  if (last <= 1) return [];
  if (last <= ALL_PAGES) return Array.from({ length: last }, (_, index) => index + 1);
  const shown = [...new Set([1, current - 1, current, current + 1, last])]
    .filter((page) => page >= 1 && page <= last)
    .sort((a, b) => a - b);
  return shown.flatMap((page, index): PageLink[] => {
    const before = shown[index - 1];
    return before !== undefined && page - before > 1 ? ["gap", page] : [page];
  });
}

/** A page of the list's address: `/papers` for the first. */
export function pageHref(page: number): string {
  return page === 1 ? "/papers" : `/papers?page=${page}`;
}

/** The day a paper was minted, in UTC, such as "10 Oct 2026". */
export function formatPublished(iso: string): string {
  return PUBLISHED_DAY.format(new Date(iso));
}

/** A paper's first authors and how many more it has, or how many it has when none was named. */
export function authorsLine(paper: Pick<PaperSummary, "authors" | "authorCount">): string {
  if (paper.authors.length === 0) {
    if (paper.authorCount === 0) return "No authors listed";
    return paper.authorCount === 1 ? "1 author" : `${paper.authorCount} authors`;
  }
  const more = paper.authorCount - paper.authors.length;
  return more > 0 ? `${paper.authors.join(", ")} +${more} more` : paper.authors.join(", ");
}

/** A signature check, as the list words it. */
export function signatureLabel(check: SignatureCheck): string {
  return check === "valid" ? "Valid" : check === "invalid" ? "Doesn't match" : "Not checked";
}

/**
 * What `/papers` shows for `page`: the list, `empty` on page 1 with no papers, `not-found`
 * past the last page or on any later page with no papers, or why the list cannot be shown.
 */
export function papersView(
  result: PaperListResult,
  page: number,
  perPage = PAPERS_PER_PAGE,
): PapersView {
  if (!result.ok) return { kind: result.reason };
  if (result.papers.length === 0) return { kind: page === 1 ? "empty" : "not-found" };
  const lastPage = pageCount(result.total, perPage);
  if (page > lastPage) return { kind: "not-found" };
  return { kind: "list", papers: result.papers, total: result.total, page, lastPage };
}
