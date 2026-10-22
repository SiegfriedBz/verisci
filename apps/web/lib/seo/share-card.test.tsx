import type { PublishedRecord, RatingListResult } from "@labstrail/workflows";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaperView } from "../publish/upload-actions.ts";
import { SITE } from "../site.ts";
import { paperCard, paperCardFor, readPaperCard, SHARE_SIZE, ShareCard } from "./share-card.tsx";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";
const LOGO = "data:image/svg+xml;base64,PHN2Zy8+";

const record: PublishedRecord = {
  title: "Screening VP1 of deformed wing virus",
  authors: ["Di Liu", "Yuting Xiao"],
  pdf: `ipfs://${CID}`,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signature: "0xefa5",
  deadline: "1791639162",
  signatureCheck: "valid",
  publisher: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
};
const published: PaperView = { stage: "published", ual: UAL, record };
const rated = (score: number): RatingListResult => ({
  ok: true,
  ratings: [
    {
      requestId: `0x${"ab".repeat(32)}`,
      contract: "0xa",
      status: "fulfilled",
      score,
      requestedAt: 1,
    },
  ],
});

describe("paperCard", () => {
  it("gives the title, the authors and the score's line", () => {
    expect(paperCard(record, 72)).toEqual({
      title: record.title,
      authors: "Di Liu and Yuting Xiao",
      score: "72",
    });
  });

  it.each([
    [[], ""],
    [["Di Liu"], "Di Liu"],
    [["Di Liu", "Yuting Xiao", "Hongmei Li"], "Di Liu, Yuting Xiao and Hongmei Li"],
    [["Di Liu", "Yuting Xiao", "Hongmei Li", "Jun Guo"], "Di Liu, Yuting Xiao et al."],
  ])("names the authors %j as %j", (authors, line) => {
    expect(paperCard({ ...record, authors }, undefined).authors).toBe(line);
  });

  it("cuts a long title at a word, to 110 characters", () => {
    const title = `${"Pseudouridine sites in messenger RNA ".repeat(5)}end`;

    const card = paperCard({ ...record, title }, undefined);

    expect(card.title.length).toBeLessThanOrEqual(110);
    expect(card.title).toMatch(/ messenger…$/);
  });

  it("leaves the score out when there is none", () => {
    expect(paperCard(record, undefined)).not.toHaveProperty("score");
  });
});

describe("paperCardFor", () => {
  it("draws a rated paper with its latest score", () => {
    expect(paperCardFor(published, rated(72))).toMatchObject({ score: "72" });
  });

  it("draws a paper not rated yet, or where no contract takes ratings, without a score", () => {
    expect(paperCardFor(published, { ok: true, ratings: [] })).not.toHaveProperty("score");
    expect(paperCardFor(published, undefined)).toEqual(paperCard(record, undefined));
  });

  it.each([
    ["a paper on its way", { stage: "minting" }, rated(72)],
    [
      "a published paper whose record the node did not give",
      { stage: "published", ual: UAL, recordProblem: "unavailable" },
      rated(72),
    ],
    ["a paper the node did not answer for", { stage: "unavailable" }, rated(72)],
    [
      "a paper whose ratings the chain did not answer for",
      published,
      { ok: false, reason: "unavailable" },
    ],
  ] satisfies [string, PaperView, RatingListResult][])(
    "leaves %s to the site's card",
    (_, view, ratings) => {
      expect(paperCardFor(view, ratings)).toBeUndefined();
    },
  );
});

describe("readPaperCard", () => {
  const reads = (overrides: Partial<Parameters<typeof readPaperCard>[1]> = {}) => ({
    readView: async () => published,
    listRatings: async () => rated(72),
    logger: { warn: vi.fn() },
    ...overrides,
  });

  it("reads a published paper and its ratings into its card", async () => {
    const listRatings = vi.fn(async () => rated(72));

    expect(await readPaperCard(CID, reads({ listRatings }))).toMatchObject({ score: "72" });
    expect(listRatings).toHaveBeenCalledWith(UAL);
  });

  it("draws the card without a score where no contract takes ratings", async () => {
    expect(await readPaperCard(CID, reads({ listRatings: async () => undefined }))).toEqual(
      paperCard(record, undefined),
    );
  });

  it("leaves a paper on its way to the site's card, without asking the chain", async () => {
    const listRatings = vi.fn(async () => rated(72));

    expect(
      await readPaperCard(
        CID,
        reads({ readView: async () => ({ stage: "minting" }), listRatings }),
      ),
    ).toBeUndefined();
    expect(listRatings).not.toHaveBeenCalled();
  });

  it("logs a read that throws and leaves the link the site's card", async () => {
    const logger = { warn: vi.fn() };

    const card = await readPaperCard(
      CID,
      reads({
        readView: async () => {
          throw new Error("node down");
        },
        logger,
      }),
    );

    expect(card).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/^share-card-unavailable: /));
  });
});

describe("ShareCard", () => {
  afterEach(cleanup);

  it("is 1200 by 630, the size social sites show", () => {
    expect(SHARE_SIZE).toEqual({ width: 1200, height: 630 });
  });

  it("shows the site's name and definition without a paper", () => {
    const { container } = render(<ShareCard logo={LOGO} />);

    expect(container.textContent).toContain(SITE.definition);
    expect(container.textContent).toContain("LabsTrail");
  });

  it("shows a paper's title, authors and score", () => {
    const { container } = render(<ShareCard logo={LOGO} paper={paperCard(record, 72)} />);

    expect(container.textContent).toContain(record.title);
    expect(container.textContent).toContain("Di Liu and Yuting Xiao");
    expect(container.textContent).toContain("72/100");
    expect(container.textContent).toContain("reproducibility readiness");
    expect(container.textContent).not.toContain(SITE.definition);
  });
});
