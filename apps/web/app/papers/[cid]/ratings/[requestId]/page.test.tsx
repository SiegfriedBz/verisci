import type { RatingView } from "@labstrail/workflows";
import { cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaperView } from "../../../../../lib/publish/upload-actions.ts";

const CID = "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m";
const REQUEST_ID = `0x${"ab".repeat(32)}`;
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
let userAgent: string | null =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const readRatingOnce = vi.fn<(requestId: string) => Promise<RatingView>>();
const readProgressOnce = vi.fn<(cid: string) => Promise<PaperView>>();
const getRatingService = vi.fn(() => ({}));
const LOCAL_CHAIN = {
  chainId: 31337,
  contract: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
  local: true,
};
let chain: typeof LOCAL_CHAIN | undefined = LOCAL_CHAIN;

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(userAgent === null ? {} : { "user-agent": userAgent }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@labstrail/workflows", () => ({
  getRatingService: () => getRatingService(),
  getUploadService: () => ({}),
}));
vi.mock("../../../../../lib/web-env.ts", () => ({ createWebEnv: () => ({ APP_ENV: "local" }) }));
vi.mock("../../../../../lib/rating/chain.ts", () => ({ ratingChainConfig: () => chain }));
vi.mock("../../../../../lib/rating/stage.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../lib/rating/stage.ts")>()),
  readRatingOnce: (requestId: string) => readRatingOnce(requestId),
}));
vi.mock("../../../../../lib/publish/upload-actions.ts", () => ({
  readProgressOnce: (cid: string) => readProgressOnce(cid),
}));
vi.mock("../../../../../components/rating/rating-loader.tsx", () => ({
  RatingLoader: (props: { cid: string; requestId: string; fresh: boolean }) => (
    <p>Rating {JSON.stringify(props)}</p>
  ),
}));

const { default: RatingPage, generateMetadata } = await import("./page.tsx");

const page = (requestId = REQUEST_ID, search: Record<string, string> = {}) =>
  RatingPage({
    params: Promise.resolve({ cid: CID, requestId }),
    searchParams: Promise.resolve(search),
  });

describe("/papers/[cid]/ratings/[requestId]", () => {
  afterEach(() => {
    cleanup();
    chain = LOCAL_CHAIN;
    getRatingService.mockClear();
    userAgent =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  });

  it("reads the rating inside its Suspense boundary", async () => {
    const element = await page();

    expect(element.type).toBe(Suspense);
    render(element);
    expect(
      screen.getByText(
        `Rating ${JSON.stringify({ cid: CID, requestId: REQUEST_ID, fresh: false })}`,
      ),
    ).toBeTruthy();
  });

  it("tells the loader the page was opened right after the request (?new=1)", async () => {
    render(await page(REQUEST_ID, { new: "1" }));

    expect(
      screen.getByText(
        `Rating ${JSON.stringify({ cid: CID, requestId: REQUEST_ID, fresh: true })}`,
      ),
    ).toBeTruthy();
  });

  it("answers 404 for an id that is not a request id, before anything streams", async () => {
    await expect(page("7")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the rating in place for a crawler that runs no JavaScript", async () => {
    userAgent = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)";

    const element = await page();

    expect(element.type).not.toBe(Suspense);
    render(element);
    expect(screen.getByText(/^Rating /)).toBeTruthy();
  });
});

describe("/papers/[cid]/ratings/[requestId] metadata", () => {
  afterEach(() => {
    readRatingOnce.mockReset();
    readProgressOnce.mockReset();
  });

  const metadata = () =>
    generateMetadata({ params: Promise.resolve({ cid: CID, requestId: REQUEST_ID }) });

  it("titles a fulfilled rating by its score and its paper, from the reads the page shares", async () => {
    readRatingOnce.mockResolvedValue({
      ok: true,
      rating: {
        requestId: REQUEST_ID,
        contract: "0xa",
        status: "fulfilled",
        score: 72,
        requestedAt: 1,
        targetUal: UAL,
      },
    });
    readProgressOnce.mockResolvedValue({
      stage: "published",
      ual: UAL,
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
    });

    expect(await metadata()).toMatchObject({
      title: "72/100 reproducibility readiness: RNAi therapies",
    });
    expect(readRatingOnce).toHaveBeenCalledWith(REQUEST_ID);
    expect(readProgressOnce).toHaveBeenCalledWith(CID);
  });

  it("keeps a rating out of search results until it is fulfilled", async () => {
    readRatingOnce.mockResolvedValue({ ok: false, reason: "unavailable" });
    readProgressOnce.mockResolvedValue({ stage: "unavailable" });

    expect(await metadata()).toMatchObject({ robots: { index: false } });
  });

  it("reads nothing for an id that is not a request id", async () => {
    expect(
      await generateMetadata({ params: Promise.resolve({ cid: CID, requestId: "7" }) }),
    ).toMatchObject({ robots: { index: false } });
    expect(readRatingOnce).not.toHaveBeenCalled();
  });

  it("reads nothing for its metadata where no contract takes ratings, and stays out of search", async () => {
    chain = undefined;
    readRatingOnce.mockClear();

    expect(await metadata()).toEqual({ title: "Rating", robots: { index: false } });
    expect(getRatingService).not.toHaveBeenCalled();
    expect(readRatingOnce).not.toHaveBeenCalled();
  });
});
