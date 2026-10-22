import { canonicalCid } from "@labstrail/core";
import type { PublishedRecord, RatingView } from "@labstrail/workflows";
import type { Metadata } from "next";
import type { PaperView } from "../publish/upload-actions.ts";
import { SITE } from "../site.ts";
import { clip } from "./clip.ts";

/** The title of a paper's page that search results leave out, by its stage. */
const STAGE_TITLES: Record<Exclude<PaperView["stage"], "not-found">, string> = {
  reading: "Publishing a paper",
  saving: "Publishing a paper",
  minting: "Publishing a paper",
  following: "Publishing a paper",
  refused: "Paper not published",
  "not-published": "Paper not published",
  failed: "Publishing stopped",
  unavailable: "Paper",
  published: "Paper",
};

/**
 * A paper page's metadata (ADR 0040), canonical at `/papers/<canonical CID>` whatever the
 * address's spelling and query. A published paper with its record is titled after itself,
 * described by its abstract (or, without one, its title and authors' count), and shared as an
 * article with its authors and mint date. `not-found` when the node has no such paper and no
 * publish run is followed (none given, or one given up), for the page to answer 404. Any other stage, or a record the node did not
 * answer for, is kept out of search results.
 */
export function paperMetadata(cid: string, view: PaperView): Metadata | "not-found" {
  if (view.stage === "not-found") return "not-found";
  const canonical = `/papers/${canonicalCid(cid) ?? cid}`;
  if (view.stage !== "published" || !view.record) {
    return {
      title: STAGE_TITLES[view.stage],
      alternates: { canonical },
      robots: { index: false },
    };
  }
  const { record } = view;
  return {
    title: record.title,
    description: record.abstract ? clip(record.abstract) : clip(summaryOf(record)),
    alternates: { canonical },
    openGraph: {
      type: "article",
      siteName: SITE.name,
      url: canonical,
      authors: [...record.authors],
      ...(record.publishedAt ? { publishedTime: record.publishedAt } : {}),
    },
  };
}

/** A paper without an abstract, in one sentence: its title, its authors' count, and where it is. */
function summaryOf(record: PublishedRecord): string {
  const count = record.authors.length;
  const by = count === 0 ? "" : `, by ${count} ${count === 1 ? "author" : "authors"}`;
  return `${record.title}${by}, published on the OriginTrail DKG and rated for reproducibility readiness on ${SITE.name}.`;
}

/**
 * A rating page's metadata (ADR 0040), canonical at `/papers/<canonical CID>/ratings/<request
 * id in lowercase>`. A fulfilled rating of this published paper is titled by its score and the
 * paper's title, and described by its rationale (or, when its R-KA could not be read, by its
 * score in a sentence). Any other rating, one of another paper, or one whose paper the node did
 * not answer for, is kept out of search results.
 */
export function ratingMetadata(
  cid: string,
  requestId: string,
  rating: RatingView,
  paper: PaperView,
): Metadata {
  const canonical = `/papers/${canonicalCid(cid) ?? cid}/ratings/${requestId.toLowerCase()}`;
  const record = paper.stage === "published" ? paper.record : undefined;
  const score = rating.ok && rating.rating.status === "fulfilled" ? rating.rating.score : undefined;
  if (
    !rating.ok ||
    score === undefined ||
    !record ||
    paper.stage !== "published" ||
    rating.rating.targetUal !== paper.ual
  ) {
    return { title: "Rating", alternates: { canonical }, robots: { index: false } };
  }
  return {
    title: `${score}/100 reproducibility readiness: ${record.title}`,
    description: rating.record
      ? clip(rating.record.rationale)
      : clip(`${record.title} scores ${score}/100 for reproducibility readiness on ${SITE.name}.`),
    alternates: { canonical },
  };
}
