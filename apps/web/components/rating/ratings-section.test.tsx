import type { RatingListResult } from "@labstrail/workflows";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const CID = "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m";
const CONTRACT = "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90";
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const listRatings = vi.fn<(ual: string) => Promise<RatingListResult>>();
let env: Record<string, string | undefined> = { APP_ENV: "staging" };

vi.mock("@labstrail/workflows", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@labstrail/workflows")>()),
  getRatingService: () => ({ listRatings }),
}));
vi.mock("../../lib/web-env.ts", () => ({ createWebEnv: () => env }));
vi.mock("./rate-button.tsx", () => ({
  RateButton: ({ config, label }: { config: unknown; label?: string }) => (
    <button type="button" data-config={JSON.stringify(config)}>
      {label ?? "Rate this paper"}
    </button>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { RatingsSection } = await import("./ratings-section.tsx");

const TITLE = "Screening VP1 of deformed wing virus";

async function show() {
  render(await RatingsSection({ ual: UAL, cid: CID, title: TITLE }));
}

/** The structured data the section holds, parsed. */
function structuredData(): unknown[] {
  return [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) =>
    JSON.parse(script.textContent ?? ""),
  );
}

describe("RatingsSection", () => {
  afterEach(() => {
    cleanup();
    listRatings.mockReset();
    env = { APP_ENV: "staging" };
  });

  it("leads with the latest score and lists every rating, newest first", async () => {
    listRatings.mockResolvedValue({
      ok: true,
      ratings: [
        {
          requestId: id(1),
          contract: CONTRACT,
          status: "cancelled",
          cancelReason: "expired",
          requestedAt: 1_791_000_000,
        },
        {
          requestId: id(2),
          contract: CONTRACT,
          status: "fulfilled",
          score: 67,
          rKaUal: "x",
          requestedAt: 1_791_900_000,
        },
        { requestId: id(3), contract: CONTRACT, status: "pending", requestedAt: 1_791_950_000 },
      ],
    });

    await show();

    expect(listRatings).toHaveBeenCalledWith(UAL);
    expect(screen.getByRole("heading", { name: "Ratings" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Reproducibility readiness" })).toBeTruthy();
    expect(screen.getByTestId("latest-score").textContent).toBe("67");
    expect(screen.getByRole("link", { name: "Read the checks" }).getAttribute("href")).toBe(
      `/papers/${CID}/ratings/${id(2)}`,
    );
    const history = within(screen.getByRole("list", { name: "Rating history" }));
    const rows = history.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/In progress/),
      expect.stringMatching(/67/),
      expect.stringMatching(/Couldn't finish/),
    ]);
    expect(
      history.getAllByRole("link", { name: /Details/ }).map((link) => link.getAttribute("href")),
    ).toEqual([3, 2, 1].map((n) => `/papers/${CID}/ratings/${id(n)}`));
  });

  it("says the latest score in one sentence, linked to how it works, and as a Review", async () => {
    const rKaUal = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/9";
    listRatings.mockResolvedValue({
      ok: true,
      ratings: [
        {
          requestId: id(1),
          contract: CONTRACT,
          status: "fulfilled",
          score: 54,
          rKaUal: "y",
          requestedAt: 1_791_000_000,
        },
        {
          requestId: id(2),
          contract: CONTRACT,
          status: "fulfilled",
          score: 72,
          rKaUal,
          requestedAt: 1_791_900_000,
        },
      ],
    });

    await show();

    expect(screen.getByTestId("score-sentence").textContent).toBe(
      `${TITLE} scores 72/100 for reproducibility readiness on LabsTrail. How the score works`,
    );
    expect(screen.getByRole("link", { name: "How the score works" }).getAttribute("href")).toBe(
      "/method",
    );
    const paper = `http://localhost:3000/papers/${CID}`;
    expect(structuredData()).toEqual([
      expect.objectContaining({
        "@type": "Review",
        "@id": `${paper}/ratings/${id(2)}#review`,
        itemReviewed: { "@id": `${paper}#paper` },
        reviewRating: expect.objectContaining({ ratingValue: 72, bestRating: 100 }),
        identifier: expect.objectContaining({ value: rKaUal }),
      }),
    ]);
  });

  it("says no score and holds no Review while no rating is fulfilled", async () => {
    listRatings.mockResolvedValue({
      ok: true,
      ratings: [{ requestId: id(1), contract: CONTRACT, status: "pending", requestedAt: 1 }],
    });

    await show();

    expect(screen.queryByTestId("score-sentence")).toBeNull();
    expect(structuredData()).toEqual([]);
  });

  it("says a paper with only a pending rating is being rated, with a link to follow it", async () => {
    listRatings.mockResolvedValue({
      ok: true,
      ratings: [{ requestId: id(1), contract: CONTRACT, status: "pending", requestedAt: 1 }],
    });

    await show();

    expect(screen.getByTestId("rating-state").textContent).toBe("Rating in progress");
    expect(screen.getByRole("link", { name: "Follow it" }).getAttribute("href")).toBe(
      `/papers/${CID}/ratings/${id(1)}`,
    );
  });

  it("offers to rate a scored paper again, saying a new rating adds its own score", async () => {
    listRatings.mockResolvedValue({
      ok: true,
      ratings: [
        {
          requestId: id(1),
          contract: CONTRACT,
          status: "fulfilled",
          score: 54,
          rKaUal: "x",
          requestedAt: 1_791_900_000,
        },
      ],
    });

    await show();

    expect(screen.getByRole("button", { name: "Rate again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rate this paper" })).toBeNull();
    expect(
      screen.getByText(/A new rating adds its own score, and the latest one shows here\./),
    ).toBeTruthy();
  });

  it("says a paper never rated is not rated yet, what a rating does, and shows the button", async () => {
    listRatings.mockResolvedValue({ ok: true, ratings: [] });

    await show();

    expect(screen.getByTestId("rating-state").textContent).toBe("Not rated yet");
    expect(screen.getByText(/takes a few minutes/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Rating history" })).toBeNull();
    const button = screen.getByRole("button", { name: "Rate this paper" });
    expect(JSON.parse(button.dataset.config ?? "{}")).toMatchObject({
      chainId: 84_532,
      local: false,
    });
  });

  it("says a paper whose request was cancelled as invalid can't be rated, without the button", async () => {
    listRatings.mockResolvedValue({
      ok: true,
      ratings: [
        {
          requestId: id(1),
          contract: CONTRACT,
          status: "cancelled",
          cancelReason: "invalid-target",
          requestedAt: 1,
        },
      ],
    });

    await show();

    expect(screen.getByTestId("rating-state").textContent).toBe("Can't be rated");
    expect(screen.queryByRole("button", { name: "Rate this paper" })).toBeNull();
    expect(screen.getByText(/can't be asked for again/)).toBeTruthy();
  });

  it("shows the three phases, the first live and the others to come", async () => {
    listRatings.mockResolvedValue({ ok: true, ratings: [] });

    await show();

    const phases = within(screen.getByRole("list", { name: "Rating phases" })).getAllByRole(
      "listitem",
    );
    expect(phases.map((phase) => phase.textContent)).toEqual([
      expect.stringMatching(/Reproducibility readiness.*live/),
      expect.stringMatching(/Human review.*next/),
      expect.stringMatching(/Wet-lab replication.*later/),
    ]);
  });

  it("is the target of the papers list's Rate link", async () => {
    listRatings.mockResolvedValue({ ok: true, ratings: [] });

    await show();

    expect(screen.getByRole("region", { name: "Ratings" }).id).toBe("rating");
  });

  it("says ratings can't be loaded when the chain doesn't answer, with a link to try again", async () => {
    listRatings.mockResolvedValue({ ok: false, reason: "unavailable" });

    await show();

    expect(screen.getByRole("alert").textContent).toMatch(/can't be loaded right now/);
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe(
      `/papers/${CID}`,
    );
  });

  it("reads nothing and says ratings aren't set up where no contract is", async () => {
    env = { APP_ENV: "local" };

    await show();

    expect(listRatings).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Rate this paper" })).toBeNull();
    expect(screen.getByText(/aren't set up here/)).toBeTruthy();
  });
});
