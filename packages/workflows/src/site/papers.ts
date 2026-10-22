import {
  canonicalContextGraph,
  paperAuthorsQuery,
  paperCountQuery,
  paperListQuery,
  parsePaperAuthors,
  parsePaperCount,
  parsePaperListing,
} from "@labstrail/core";
import type { DkgClient, DkgFailure } from "@labstrail/dkg";
import { signatureMatches, type VerifyOptions } from "../publish/verify-submission.ts";

/** The largest page `listPapers` reads. */
const MAX_PAGE_SIZE = 50;
/** How many of each paper's authors the list shows by name. */
const FIRST_AUTHORS = 3;
/** How long a page (the list, a paper's) waits on the chain for one signature check. */
const CHECK_TIMEOUT_MS = 3000;

/** A published paper as the papers list shows it. */
export interface PaperSummary {
  /** The PDF's canonical CID: the paper's page is `/papers/<cid>`. */
  readonly cid: string;
  /** The Target KA's UAL, normalized (ADR 0031). */
  readonly ual: string;
  /** When the node minted it, as an ISO date-time. */
  readonly publishedAt: string;
  readonly title: string;
  /** The first three authors, in their order on the paper. */
  readonly authors: readonly string[];
  /** How many authors the paper has in all. */
  readonly authorCount: number;
  /** The submitter's address, as the Target KA records it. */
  readonly submitter: string;
  /** Whether the signature is the submitter's, checked when read: `unknown` if the chain did not answer. */
  readonly signatureCheck: SignatureCheck;
}

/** A signature check as the pages show it. */
export type SignatureCheck = "valid" | "invalid" | "unknown";

/**
 * One page of the papers list with the total, or why it cannot be shown: `unavailable` when
 * the node did not answer (worth asking again), `unreadable` when it refused a query,
 * answered one that does not parse, or gave no readable row for a page the total covers
 * (ADR 0021).
 */
export type PaperListResult =
  | { readonly ok: true; readonly total: number; readonly papers: readonly PaperSummary[] }
  | { readonly ok: false; readonly reason: QueryProblem };

/** Why a query's answer cannot be used. */
export type QueryProblem = "unavailable" | "unreadable";

/** What {@link listPapers} reads with. */
export interface PaperListDeps {
  /** This environment's context graph id, as the node spells it. */
  readonly contextGraph: string;
  readonly query: DkgClient["query"];
  /** Asks the chain about smart-contract wallets' signatures. */
  readonly chain: VerifyOptions["client"];
}

/**
 * One page of the graph's published papers, newest mint first, with the total
 * (`docs/domain.md` → DKG): only Target KAs our node minted, each read from its own asset's
 * graph. The page and the count are asked at once, then the page's first authors, then each
 * signature is checked as the paper's page checks it ({@link checkSignature}: `unknown`
 * after 3 s). A page past the last gives no papers and the total; a page the total covers
 * that comes back with no readable row is `unreadable`. Throws a `RangeError` for a
 * page or page size that is not a positive integer, a page size over 50, or a page whose
 * offset is not a safe integer: a bug in the caller, not an expected failure.
 */
export async function listPapers(
  options: { readonly page: number; readonly pageSize: number },
  deps: PaperListDeps,
): Promise<PaperListResult> {
  const { page, pageSize } = options;
  const offset = (page - 1) * pageSize;
  if (!positive(page) || !positive(pageSize) || pageSize > MAX_PAGE_SIZE || !positive(offset + 1)) {
    throw new RangeError(`no page ${page} of ${pageSize} papers`);
  }
  const listQuery = paperListQuery(deps.contextGraph, { limit: pageSize, offset });
  const countQuery = paperCountQuery(deps.contextGraph);
  if (!listQuery || !countQuery) return { ok: false, reason: "unreadable" };

  const [listed, counted] = await Promise.all([deps.query(listQuery), deps.query(countQuery)]);
  if (!listed.ok) return { ok: false, reason: queryProblem(listed) };
  if (!counted.ok) return { ok: false, reason: queryProblem(counted) };
  const total = parsePaperCount(counted.bindings);
  if (total === undefined) return { ok: false, reason: "unreadable" };
  const listings = parsePaperListing(listed.bindings);
  // No readable row on a page the total covers is a broken answer, not an empty page
  // (ADR 0021); past the last page, an empty page is the answer.
  if (listings.length === 0) {
    return listed.bindings.length === 0 && offset >= total
      ? { ok: true, total, papers: [] }
      : { ok: false, reason: "unreadable" };
  }
  const authorsQuery = paperAuthorsQuery(deps.contextGraph, listings, FIRST_AUTHORS);
  if (!authorsQuery) return { ok: false, reason: "unreadable" };

  const answered = await deps.query(authorsQuery);
  if (!answered.ok) return { ok: false, reason: queryProblem(answered) };
  const authors = parsePaperAuthors(answered.bindings);
  const contextGraph = canonicalContextGraph(deps.contextGraph);
  const papers = await Promise.all(
    listings.map(async (listing): Promise<PaperSummary> => {
      const check = await checkSignature({ ...listing, contextGraph }, deps.chain);
      return {
        cid: listing.cid,
        ual: listing.ual,
        publishedAt: listing.publishedAt,
        title: listing.title,
        authors: authors.get(listing.cid) ?? [],
        authorCount: listing.authorCount,
        submitter: listing.submitter,
        signatureCheck: check,
      };
    }),
  );
  return { ok: true, total, papers };
}

/**
 * Why a failed query cannot be used: `unavailable` when the node did not answer, asked to
 * retry, or answered 429 or a server error; `unreadable` when it refused the query.
 */
export function queryProblem(failure: DkgFailure): QueryProblem {
  const passing =
    failure.reason === "unreachable" ||
    failure.reason === "retry-later" ||
    failure.status === 429 ||
    (failure.status !== undefined && failure.status >= 500);
  return passing ? "unavailable" : "unreadable";
}

/**
 * Whether a paper's signature is its submitter's, as the pages show it: checked as
 * `signatureMatches` checks it, and `unknown` when the chain did not answer within 3 s, so a
 * slow RPC never holds a page.
 */
export async function checkSignature(
  signed: Parameters<typeof signatureMatches>[0],
  chain: VerifyOptions["client"],
): Promise<SignatureCheck> {
  return signatureCheck(await within(CHECK_TIMEOUT_MS, signatureMatches(signed, chain)));
}

/** A signature check from `signatureMatches`: `unreachable` (the chain did not answer) is `unknown`. */
function signatureCheck(matches: boolean | "unreachable"): SignatureCheck {
  return matches === "unreachable" ? "unknown" : matches ? "valid" : "invalid";
}

/** What `check` answers, or `unreachable` when it takes more than `ms`. */
async function within(
  ms: number,
  check: Promise<boolean | "unreachable">,
): Promise<boolean | "unreachable"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"unreachable">((resolve) => {
    timer = setTimeout(() => resolve("unreachable"), ms);
  });
  try {
    return await Promise.race([check, late]);
  } finally {
    clearTimeout(timer);
  }
}

function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}
