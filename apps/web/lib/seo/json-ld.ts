import { canonicalCid } from "@labstrail/core";
import type { PublishedRecord } from "@labstrail/workflows";
import { ipfsUrl } from "../papers/explorer.ts";
import { SITE } from "../site.ts";
import { clip } from "./clip.ts";

/** A schema.org node, as plain JSON. */
export type JsonLdNode = Record<string, unknown>;

/** A page's structured data: several nodes, linked by their `@id`s. */
export interface JsonLdGraph {
  readonly "@context": "https://schema.org";
  readonly "@graph": JsonLdNode[];
}

/** One step of a breadcrumb: its name and its absolute URL. */
export interface Crumb {
  readonly name: string;
  readonly url: string;
}

/** What a rating's `Review` says: the paper page has its score, the rating page its rationale too. */
export interface ReviewFacts {
  readonly requestId: string;
  readonly score: number;
  readonly rationale?: string;
  readonly rKaUal?: string;
}

const CONTEXT = "https://schema.org";
/** Google's longest headline for an article. */
const HEADLINE_LENGTH = 110;

const orgOf = (site: string) => ({ "@id": `${site}/#org` });
/** A CID in the one spelling the paper's canonical address uses, whatever the link's. */
const canonical = (cid: string) => canonicalCid(cid) ?? cid;
const paperUrl = (site: string, cid: string) => `${site}/papers/${canonical(cid)}`;
/** A rating's address, as its canonical link writes it: its request id in lowercase. */
const ratingUrl = (site: string, cid: string, requestId: string) =>
  `${paperUrl(site, cid)}/ratings/${requestId.toLowerCase()}`;
const property = (propertyID: string, value: string) => ({
  "@type": "PropertyValue",
  propertyID,
  value,
});

/**
 * The home page's structured data: the website and the organization behind it, with the
 * GitHub repo and the maintainer's LinkedIn as who stands behind it. LabsTrail has no search,
 * so no `SearchAction`.
 */
export function siteJsonLd(site: string): JsonLdGraph {
  return {
    "@context": CONTEXT,
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        name: SITE.name,
        url: site,
        description: SITE.description,
        inLanguage: "en",
        publisher: orgOf(site),
      },
      {
        "@type": "Organization",
        ...orgOf(site),
        name: SITE.name,
        url: site,
        logo: `${site}/icon.svg`,
        sameAs: [SITE.repo],
        founder: {
          "@type": "Person",
          name: SITE.maintainer.name,
          sameAs: [SITE.maintainer.linkedIn],
        },
      },
    ],
  };
}

/**
 * A published paper's structured data: a `ScholarlyArticle` mirroring the Target KA's
 * schema.org record (ADR 0010), with its DOI, DKG UAL and IPFS CID (in its canonical
 * spelling) as identifiers and the PDF as its encoding, then its breadcrumb. LabsTrail is named
 * as the publisher of this record (`sdPublisher`, dated by its mint, `sdDatePublished`), never
 * of the paper, whose journal and date the record does not hold. Fields the record lacks are
 * left out, never empty; the submitter's wallet is never an author (ADR 0040).
 */
export function paperJsonLd(
  site: string,
  cid: string,
  ual: string,
  record: PublishedRecord,
): JsonLdGraph {
  const url = paperUrl(site, cid);
  const id = canonical(cid);
  const article: JsonLdNode = {
    "@type": "ScholarlyArticle",
    "@id": `${url}#paper`,
    url,
    mainEntityOfPage: url,
    name: record.title,
    headline: clip(record.title, HEADLINE_LENGTH),
    ...(record.abstract ? { abstract: record.abstract } : {}),
    ...(record.authors.length > 0
      ? { author: record.authors.map((name) => ({ "@type": "Person", name })) }
      : {}),
    ...(record.publishedAt ? { sdDatePublished: record.publishedAt } : {}),
    ...(record.doi ? { sameAs: `https://doi.org/${record.doi}` } : {}),
    identifier: [
      ...(record.doi ? [property("DOI", record.doi)] : []),
      property("DKG UAL", ual),
      property("IPFS CID", id),
    ],
    encoding: {
      "@type": "MediaObject",
      contentUrl: ipfsUrl(id),
      encodingFormat: "application/pdf",
    },
    isAccessibleForFree: true,
    sdPublisher: orgOf(site),
  };
  return {
    "@context": CONTEXT,
    "@graph": [
      article,
      breadcrumbJsonLd([
        { name: "Papers", url: `${site}/papers` },
        { name: record.title, url },
      ]),
    ],
  };
}

/**
 * A fulfilled rating as a `Review` of its paper (`itemReviewed`, the paper's `@id`), written by
 * LabsTrail, scored out of 100, with its rationale and its R-KA's UAL when given. One `Review`
 * per rating, as its R-KA is: never an `aggregateRating`, never a `ClaimReview` (ADR 0040).
 */
export function reviewJsonLd(site: string, cid: string, rating: ReviewFacts): JsonLdNode {
  const url = ratingUrl(site, cid, rating.requestId);
  return {
    "@context": CONTEXT,
    "@type": "Review",
    "@id": `${url}#review`,
    url,
    name: "Reproducibility readiness",
    reviewAspect: "reproducibility readiness",
    itemReviewed: { "@id": `${paperUrl(site, cid)}#paper` },
    author: orgOf(site),
    reviewRating: { "@type": "Rating", ratingValue: rating.score, bestRating: 100, worstRating: 0 },
    ...(rating.rationale ? { reviewBody: rating.rationale } : {}),
    ...(rating.rKaUal ? { identifier: property("DKG UAL", rating.rKaUal) } : {}),
  };
}

/**
 * A fulfilled rating's page: its `Review` ({@link reviewJsonLd}) and its breadcrumb, through
 * its paper (Papers, the paper's title, Rating).
 */
export function ratingPageJsonLd(
  site: string,
  cid: string,
  rating: ReviewFacts,
  paperTitle: string,
): JsonLdGraph {
  const { "@context": _context, ...review } = reviewJsonLd(site, cid, rating);
  const paper = paperUrl(site, cid);
  return {
    "@context": CONTEXT,
    "@graph": [
      review,
      breadcrumbJsonLd([
        { name: "Papers", url: `${site}/papers` },
        { name: paperTitle, url: paper },
        { name: "Rating", url: ratingUrl(site, cid, rating.requestId) },
      ]),
    ],
  };
}

/** A `BreadcrumbList` of `crumbs`, numbered from 1. */
export function breadcrumbJsonLd(crumbs: readonly Crumb[]): JsonLdNode & {
  readonly itemListElement: JsonLdNode[];
} {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

/**
 * Structured data as a script's text: JSON with every `<` written `<`, so a title or an
 * abstract read from a PDF cannot close the `<script>` tag.
 */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
