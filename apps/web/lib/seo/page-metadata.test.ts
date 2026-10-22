import type { PublishedRecord, RatingView } from "@labstrail/workflows";
import { describe, expect, it } from "vitest";
import type { PaperView } from "../publish/upload-actions.ts";
import { paperMetadata, ratingMetadata } from "./page-metadata.ts";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
/** The same file's CID in its CIDv0 spelling. */
const V0 = "QmeuWS7yCDk5yJEY1JC3zsp1WQeArgyU1Q4shjP7njFBcn";
const V0_CANONICAL = "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m";
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";

const record: PublishedRecord = {
  title: "Screening VP1 of deformed wing virus",
  authors: ["Di Liu", "Yuting Xiao", "Hongmei Li", "Jun Guo"],
  abstract:
    "Deformed wing virus is a major threat to honeybees worldwide. We screened the capsid protein VP1 for epitopes that neutralise the virus in cell culture and in larvae, and mapped them to its surface.",
  pdf: `ipfs://${CID}`,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signature: "0xefa5",
  deadline: "1791639162",
  signatureCheck: "valid",
  publisher: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
  publishedAt: "2026-10-17T08:42:01.123Z",
};
const published: PaperView = { stage: "published", ual: UAL, record };

describe("paperMetadata", () => {
  it("titles a published paper after itself, described by its abstract, as an article", () => {
    const metadata = paperMetadata(CID, published);

    expect(metadata).toMatchObject({
      title: record.title,
      alternates: { canonical: `/papers/${CID}` },
      openGraph: {
        type: "article",
        siteName: "LabsTrail",
        url: `/papers/${CID}`,
        authors: record.authors,
        publishedTime: "2026-10-17T08:42:01.123Z",
      },
    });
    expect(metadata).not.toHaveProperty("robots");
    const description = metadata === "not-found" ? "" : String(metadata.description);
    expect(description.length).toBeLessThanOrEqual(155);
    expect(description).toMatch(
      /^Deformed wing virus is a major threat to honeybees worldwide\. .*…$/,
    );
  });

  it("gives every spelling of the CID the canonical one", () => {
    expect(paperMetadata(V0, published)).toMatchObject({
      alternates: { canonical: `/papers/${V0_CANONICAL}` },
    });
  });

  it("describes a paper without an abstract by its title and its authors' count", () => {
    const { abstract: _abstract, publishedAt: _publishedAt, ...bare } = record;

    const metadata = paperMetadata(CID, { stage: "published", ual: UAL, record: bare });

    expect(metadata).toMatchObject({
      description: `${record.title}, by 4 authors, published on the OriginTrail DKG and rated for reproducibility readiness on LabsTrail.`,
    });
    expect(metadata === "not-found" ? {} : metadata.openGraph).not.toHaveProperty("publishedTime");
  });

  it("says one author", () => {
    const { abstract: _abstract, ...bare } = record;

    expect(
      paperMetadata(CID, {
        stage: "published",
        ual: UAL,
        record: { ...bare, authors: ["Di Liu"] },
      }),
    ).toMatchObject({ description: expect.stringContaining(", by 1 author, published") });
  });

  it("is not found when the node has no such paper and no run is followed", () => {
    expect(paperMetadata(CID, { stage: "not-found" })).toBe("not-found");
  });

  it.each([
    [{ stage: "reading" }, "Publishing a paper"],
    [{ stage: "saving" }, "Publishing a paper"],
    [{ stage: "minting" }, "Publishing a paper"],
    [{ stage: "following" }, "Publishing a paper"],
    [{ stage: "refused", reason: "outside-field" }, "Paper not published"],
    [{ stage: "not-published" }, "Paper not published"],
    [{ stage: "failed" }, "Publishing stopped"],
    [{ stage: "unavailable" }, "Paper"],
    [{ stage: "published", ual: UAL, recordProblem: "unavailable" }, "Paper"],
  ] satisfies [PaperView, string][])("keeps %j out of search results, titled %s", (view, title) => {
    expect(paperMetadata(CID, view)).toEqual({
      title,
      alternates: { canonical: `/papers/${CID}` },
      robots: { index: false },
    });
  });
});

describe("ratingMetadata", () => {
  const REQUEST = `0x${"AB".repeat(32)}`;
  const RATING_PATH = `/papers/${CID}/ratings/${REQUEST.toLowerCase()}`;
  const rationale =
    "The paper names its virus strains, its cell lines and its larvae's ages, and reports its statistics with their tests, but gives no sample size calculation and no blinding.";
  const fulfilled: RatingView = {
    ok: true,
    rating: {
      requestId: REQUEST.toLowerCase(),
      contract: "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90",
      status: "fulfilled",
      score: 72,
      rKaUal: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/9",
      requestedAt: 1_791_900_000,
      targetUal: UAL,
    },
    record: {
      requestId: REQUEST.toLowerCase(),
      targetUal: UAL,
      score: 72,
      rationale,
      checks: [],
      model: "gemini-3.8-flash",
      promptVersion: "2",
    },
  };

  it("titles a fulfilled rating by its score and its paper, described by its rationale", () => {
    const metadata = ratingMetadata(V0, REQUEST, fulfilled, published);

    expect(metadata).toMatchObject({
      title: `72/100 reproducibility readiness: ${record.title}`,
      alternates: { canonical: `/papers/${V0_CANONICAL}/ratings/${REQUEST.toLowerCase()}` },
    });
    expect(metadata).not.toHaveProperty("robots");
    expect(String(metadata.description).length).toBeLessThanOrEqual(155);
    expect(String(metadata.description)).toMatch(/^The paper names its virus strains/);
  });

  it("says the score in its description when the R-KA could not be read", () => {
    const { record: _record, ...chainOnly } = fulfilled as Extract<RatingView, { ok: true }>;

    expect(ratingMetadata(CID, REQUEST, chainOnly, published)).toMatchObject({
      description: `${record.title} scores 72/100 for reproducibility readiness on LabsTrail.`,
    });
  });

  it.each([
    [
      "a rating not fulfilled",
      {
        ...fulfilled,
        rating: { ...(fulfilled as Extract<RatingView, { ok: true }>).rating, status: "pending" },
      },
      published,
    ],
    ["a rating the chain did not answer for", { ok: false, reason: "unavailable" }, published],
    ["a rating no contract holds", { ok: false, reason: "not-found" }, published],
    ["a rating of another paper", fulfilled, { stage: "published", ual: `${UAL}0`, record }],
    ["a paper the node did not answer for", fulfilled, { stage: "unavailable" }],
  ] satisfies [string, RatingView, PaperView][])(
    "keeps %s out of search results",
    (_, rating, paper) => {
      expect(ratingMetadata(CID, REQUEST, rating, paper)).toEqual({
        title: "Rating",
        alternates: { canonical: `/papers/${CID}/ratings/${REQUEST.toLowerCase()}` },
        robots: { index: false },
      });
    },
  );

  it("canonicalizes the request id in lowercase", () => {
    expect(ratingMetadata(CID, REQUEST, fulfilled, published).alternates).toEqual({
      canonical: RATING_PATH,
    });
  });
});
