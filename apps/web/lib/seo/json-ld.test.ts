import { canonicalCid } from "@labstrail/core";
import type { PublishedRecord } from "@labstrail/workflows";
import { describe, expect, it } from "vitest";
import {
  breadcrumbJsonLd,
  paperJsonLd,
  ratingPageJsonLd,
  reviewJsonLd,
  serializeJsonLd,
  siteJsonLd,
} from "./json-ld.ts";

const SITE = "https://labstrail.vercel.app";
const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";
const REQUEST = `0x${"ab".repeat(32)}`;
const PAPER = `${SITE}/papers/${CID}`;

const record: PublishedRecord = {
  title: "Screening VP1 of deformed wing virus",
  authors: ["Di Liu", "Yuting Xiao"],
  abstract: "Deformed wing virus is a major threat to honeybees.",
  doi: "10.1016/j.xgen.2026.101332",
  pdf: `ipfs://${CID}`,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signature: "0xefa5",
  deadline: "1791639162",
  signatureCheck: "valid",
  publisher: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
  publishedAt: "2026-10-17T08:42:01.123Z",
};

describe("siteJsonLd", () => {
  it("describes the website and the organization behind it, linked by their ids", () => {
    expect(siteJsonLd(SITE)).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${SITE}/#website`,
          name: "LabsTrail",
          url: SITE,
          description: expect.stringMatching(/life-science and health papers/),
          inLanguage: "en",
          publisher: { "@id": `${SITE}/#org` },
        },
        {
          "@type": "Organization",
          "@id": `${SITE}/#org`,
          name: "LabsTrail",
          url: SITE,
          logo: `${SITE}/icon.svg`,
          sameAs: ["https://github.com/SiegfriedBz/labstrail"],
          founder: {
            "@type": "Person",
            name: "Siegfried Bozza",
            sameAs: ["https://www.linkedin.com/in/siegfriedbozza"],
          },
        },
      ],
    });
  });

  it("offers no site search, which LabsTrail does not have", () => {
    expect(JSON.stringify(siteJsonLd(SITE))).not.toContain("SearchAction");
  });
});

describe("paperJsonLd", () => {
  it("describes a published paper as a ScholarlyArticle, with its breadcrumb", () => {
    expect(paperJsonLd(SITE, CID, UAL, record)).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "ScholarlyArticle",
          "@id": `${PAPER}#paper`,
          url: PAPER,
          mainEntityOfPage: PAPER,
          name: record.title,
          headline: record.title,
          abstract: record.abstract,
          author: [
            { "@type": "Person", name: "Di Liu" },
            { "@type": "Person", name: "Yuting Xiao" },
          ],
          sdDatePublished: "2026-10-17T08:42:01.123Z",
          sameAs: "https://doi.org/10.1016/j.xgen.2026.101332",
          identifier: [
            { "@type": "PropertyValue", propertyID: "DOI", value: "10.1016/j.xgen.2026.101332" },
            { "@type": "PropertyValue", propertyID: "DKG UAL", value: UAL },
            { "@type": "PropertyValue", propertyID: "IPFS CID", value: CID },
          ],
          encoding: {
            "@type": "MediaObject",
            contentUrl: `https://gateway.pinata.cloud/ipfs/${CID}`,
            encodingFormat: "application/pdf",
          },
          isAccessibleForFree: true,
          sdPublisher: { "@id": `${SITE}/#org` },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Papers", item: `${SITE}/papers` },
            { "@type": "ListItem", position: 2, name: record.title, item: PAPER },
          ],
        },
      ],
    });
  });

  it("leaves out what the record lacks, never an empty field", () => {
    const { abstract: _abstract, doi: _doi, publishedAt: _publishedAt, ...bare } = record;

    const [article] = paperJsonLd(SITE, CID, UAL, { ...bare, authors: [] })["@graph"];

    expect(article).not.toHaveProperty("abstract");
    expect(article).not.toHaveProperty("sameAs");
    expect(article).not.toHaveProperty("sdDatePublished");
    expect(article).not.toHaveProperty("author");
    expect(article?.identifier).toEqual([
      { "@type": "PropertyValue", propertyID: "DKG UAL", value: UAL },
      { "@type": "PropertyValue", propertyID: "IPFS CID", value: CID },
    ]);
  });

  it("names LabsTrail as the publisher of this record, never of the paper", () => {
    const [article] = paperJsonLd(SITE, CID, UAL, record)["@graph"];

    expect(article).not.toHaveProperty("publisher");
    expect(article).not.toHaveProperty("datePublished");
    expect(article).toMatchObject({
      sdPublisher: { "@id": `${SITE}/#org` },
      sdDatePublished: record.publishedAt,
    });
  });

  it("writes the paper's addresses with its canonical CID, whatever the link's spelling", () => {
    const v0 = "QmeuWS7yCDk5yJEY1JC3zsp1WQeArgyU1Q4shjP7njFBcn";
    const v1 = canonicalCid(v0);

    const data = JSON.stringify(paperJsonLd(SITE, v0, UAL, record));

    expect(v1).toMatch(/^bafy/);
    expect(data).not.toContain(v0);
    expect(data).toContain(`${SITE}/papers/${v1}#paper`);
    expect(data).toContain(`"value":"${v1}"`);
  });

  it("never names the submitter's wallet as an author", () => {
    expect(JSON.stringify(paperJsonLd(SITE, CID, UAL, record))).not.toContain(record.submitter);
  });

  it("cuts a long title to 110 characters for the headline", () => {
    const title = `${"Pseudouridine sites in messenger RNA ".repeat(5)}end`;

    const [article] = paperJsonLd(SITE, CID, UAL, { ...record, title })["@graph"];

    expect(article?.name).toBe(title);
    expect(String(article?.headline).length).toBeLessThanOrEqual(110);
    expect(String(article?.headline)).toMatch(/…$/);
  });
});

describe("reviewJsonLd", () => {
  it("describes a rating as a Review of the paper, by LabsTrail, out of 100", () => {
    expect(reviewJsonLd(SITE, CID, { requestId: REQUEST, score: 72 })).toEqual({
      "@context": "https://schema.org",
      "@type": "Review",
      "@id": `${PAPER}/ratings/${REQUEST}#review`,
      url: `${PAPER}/ratings/${REQUEST}`,
      name: "Reproducibility readiness",
      reviewAspect: "reproducibility readiness",
      itemReviewed: { "@id": `${PAPER}#paper` },
      author: { "@id": `${SITE}/#org` },
      reviewRating: {
        "@type": "Rating",
        ratingValue: 72,
        bestRating: 100,
        worstRating: 0,
      },
    });
  });

  it("writes the rating's address as its canonical link does, request id in lowercase", () => {
    const review = reviewJsonLd(SITE, CID, { requestId: `0x${"AB".repeat(32)}`, score: 72 });

    expect(review.url).toBe(`${PAPER}/ratings/${REQUEST}`);
  });

  it("adds the rationale and the R-KA's UAL when the rating page has them", () => {
    const rKaUal = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/9";

    expect(
      reviewJsonLd(SITE, CID, {
        requestId: REQUEST,
        score: 72,
        rationale: "The paper names its strains and its statistics.",
        rKaUal,
      }),
    ).toMatchObject({
      reviewBody: "The paper names its strains and its statistics.",
      identifier: { "@type": "PropertyValue", propertyID: "DKG UAL", value: rKaUal },
    });
  });

  it("claims no aggregate rating and no fact-check", () => {
    const text = JSON.stringify([
      reviewJsonLd(SITE, CID, { requestId: REQUEST, score: 72 }),
      paperJsonLd(SITE, CID, UAL, record),
    ]);

    expect(text).not.toContain("aggregateRating");
    expect(text).not.toContain("ClaimReview");
  });
});

describe("ratingPageJsonLd", () => {
  it("holds the rating's Review and its breadcrumb, through its paper", () => {
    const data = ratingPageJsonLd(
      SITE,
      CID,
      { requestId: REQUEST, score: 72, rationale: "It names its strains." },
      record.title,
    );

    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@graph"]).toEqual([
      expect.objectContaining({
        "@type": "Review",
        reviewBody: "It names its strains.",
        itemReviewed: { "@id": `${PAPER}#paper` },
      }),
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Papers", item: `${SITE}/papers` },
          { "@type": "ListItem", position: 2, name: record.title, item: PAPER },
          {
            "@type": "ListItem",
            position: 3,
            name: "Rating",
            item: `${PAPER}/ratings/${REQUEST}`,
          },
        ],
      },
    ]);
    expect(data["@graph"][0]).not.toHaveProperty("@context");
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers each step from 1", () => {
    expect(
      breadcrumbJsonLd([
        { name: "Papers", url: `${SITE}/papers` },
        { name: "Rating", url: `${PAPER}/ratings/${REQUEST}` },
      ]).itemListElement,
    ).toEqual([
      { "@type": "ListItem", position: 1, name: "Papers", item: `${SITE}/papers` },
      { "@type": "ListItem", position: 2, name: "Rating", item: `${PAPER}/ratings/${REQUEST}` },
    ]);
  });
});

describe("serializeJsonLd", () => {
  it("writes < as \\u003c, so a PDF's text cannot close the script tag", () => {
    const text = serializeJsonLd({ name: "Bees </script><script>alert(1)</script>" });

    expect(text).not.toContain("<");
    expect(text).toContain("\\u003c/script>");
    expect(JSON.parse(text)).toEqual({ name: "Bees </script><script>alert(1)</script>" });
  });
});
