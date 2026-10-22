import type { PaperStatus, RatingView } from "@labstrail/workflows";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const CID = "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m";
const REQUEST_ID = `0x${"ab".repeat(32)}`;
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const readRating = vi.fn<(id: string) => Promise<RatingView>>();
const readPaper = vi.fn<(cid: string) => Promise<PaperStatus>>();

vi.mock("@labstrail/workflows", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@labstrail/workflows")>()),
  getRatingService: () => ({ readRating }),
  getUploadService: () => ({ readPaper }),
}));
let env: Record<string, string | undefined> = { APP_ENV: "staging" };
vi.mock("../../lib/web-env.ts", () => ({ createWebEnv: () => env }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("./rating-progress.tsx", () => ({
  RatingProgress: (props: {
    title: string;
    ual?: string;
    local: boolean;
    nodeDown?: boolean;
    fresh?: boolean;
    initial: RatingView;
  }) => (
    <p>
      progress of {props.title}, local {String(props.local)}, node down{" "}
      {String(props.nodeDown ?? false)}, paper {props.ual ?? "unknown"}
      {props.fresh ? `, fresh, ${props.initial.ok ? "found" : props.initial.reason}` : ""}
    </p>
  ),
}));

const { RatingLoader } = await import("./rating-loader.tsx");

const PUBLISHED: PaperStatus = {
  asset: { ok: true, state: "minted", ual: UAL },
  run: undefined,
  record: {
    title: "RNAi therapies",
    authors: [],
    pdf: `ipfs://${CID}`,
    submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
    signature: "0x",
    deadline: "1",
    signatureCheck: "valid",
    publisher: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
  },
};
const PENDING: RatingView = {
  ok: true,
  rating: {
    requestId: REQUEST_ID,
    contract: "0xa",
    status: "pending",
    requestedAt: 1,
    targetUal: UAL,
  },
  stage: "scoring",
};

describe("RatingLoader", () => {
  afterEach(() => {
    cleanup();
    readRating.mockReset();
    readPaper.mockReset();
    env = { APP_ENV: "staging" };
  });

  it("reads the rating and the paper's title for its page", async () => {
    readRating.mockResolvedValue(PENDING);
    readPaper.mockResolvedValue(PUBLISHED);

    render(await RatingLoader({ cid: CID, requestId: REQUEST_ID }));

    expect(readRating).toHaveBeenCalledWith(REQUEST_ID);
    expect(
      screen.getByText(`progress of RNAi therapies, local false, node down false, paper ${UAL}`),
    ).toBeTruthy();
  });

  it("describes a fulfilled rating as a Review of its paper, with its breadcrumb", async () => {
    readRating.mockResolvedValue({
      ok: true,
      rating: {
        requestId: REQUEST_ID,
        contract: "0xa",
        status: "fulfilled",
        score: 72,
        rKaUal: `${UAL}9`,
        requestedAt: 1,
        targetUal: UAL,
      },
      record: {
        requestId: REQUEST_ID,
        targetUal: UAL,
        score: 72,
        rationale: "It names its strains.",
        checks: [],
        model: "gemini-3.8-flash",
        promptVersion: "2",
      },
    });
    readPaper.mockResolvedValue(PUBLISHED);

    render(await RatingLoader({ cid: CID, requestId: REQUEST_ID }));

    const [data] = [...document.querySelectorAll('script[type="application/ld+json"]')].map(
      (script) => JSON.parse(script.textContent ?? ""),
    );
    expect(data["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual([
      "Review",
      "BreadcrumbList",
    ]);
    expect(data["@graph"][0]).toMatchObject({
      reviewBody: "It names its strains.",
      reviewRating: { ratingValue: 72 },
    });
  });

  it("gives search engines nothing to describe while the rating runs", async () => {
    readRating.mockResolvedValue(PENDING);
    readPaper.mockResolvedValue(PUBLISHED);

    render(await RatingLoader({ cid: CID, requestId: REQUEST_ID }));

    expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0);
  });

  it("is not found when the rating is of another paper", async () => {
    readRating.mockResolvedValue({
      ...PENDING,
      rating: { ...(PENDING.ok ? PENDING.rating : ({} as never)), targetUal: `${UAL}0` },
    } as RatingView);
    readPaper.mockResolvedValue(PUBLISHED);

    await expect(RatingLoader({ cid: CID, requestId: REQUEST_ID })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("is not found when no contract holds the id", async () => {
    readRating.mockResolvedValue({ ok: false, reason: "not-found" });
    readPaper.mockResolvedValue(PUBLISHED);

    await expect(RatingLoader({ cid: CID, requestId: REQUEST_ID })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("follows a request no contract holds yet when the page was opened right after it", async () => {
    readRating.mockResolvedValue({ ok: false, reason: "not-found" });
    readPaper.mockResolvedValue(PUBLISHED);

    render(await RatingLoader({ cid: CID, requestId: REQUEST_ID, fresh: true }));

    expect(
      screen.getByText(
        `progress of RNAi therapies, local false, node down false, paper ${UAL}, fresh, unavailable`,
      ),
    ).toBeTruthy();
  });

  it("still follows a rating the chain didn't answer for, with the paper's UAL to check it by", async () => {
    readRating.mockResolvedValue({ ok: false, reason: "unavailable" });
    readPaper.mockResolvedValue(PUBLISHED);

    render(await RatingLoader({ cid: CID, requestId: REQUEST_ID }));

    expect(
      screen.getByText(`progress of RNAi therapies, local false, node down false, paper ${UAL}`),
    ).toBeTruthy();
  });

  it("is not found when the node answers that the paper isn't published", async () => {
    readRating.mockResolvedValue({ ok: false, reason: "unavailable" });
    readPaper.mockResolvedValue({
      asset: { ok: true, state: "missing" },
      run: undefined,
    } as unknown as PaperStatus);

    await expect(RatingLoader({ cid: CID, requestId: REQUEST_ID })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("still shows the rating, under the paper's short address, when the node doesn't answer", async () => {
    readRating.mockResolvedValue(PENDING);
    readPaper.mockResolvedValue({
      asset: { ok: false, reason: "unreachable" },
      run: undefined,
    } as unknown as PaperStatus);

    render(await RatingLoader({ cid: CID, requestId: REQUEST_ID }));

    expect(screen.getByText(/progress of bafybe.*, node down true, paper unknown/)).toBeTruthy();
  });

  it("says ratings aren't set up, and reads nothing, where no contract takes them", async () => {
    env = { APP_ENV: "local" };

    render(await RatingLoader({ cid: CID, requestId: REQUEST_ID }));

    expect(readRating).not.toHaveBeenCalled();
    expect(screen.getByText(/aren't set up here/)).toBeTruthy();
  });
});
