import { SCORER_PROMPT_VERSION } from "@labstrail/core";
import type { RatingView } from "@labstrail/workflows";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RatingProgress } from "./rating-progress.tsx";

const CID = "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m";
const REQUEST_ID = `0x${"ab".repeat(32)}`;
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const R_KA = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/14";
const CONTRACT = "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90";
const RATING = {
  requestId: REQUEST_ID,
  contract: CONTRACT,
  requestedAt: 1_791_900_000,
  targetUal: UAL,
};

const SCORED: RatingView = {
  ok: true,
  rating: { ...RATING, status: "fulfilled", score: 67, rKaUal: R_KA },
  gap: false,
  record: {
    requestId: REQUEST_ID,
    targetUal: UAL,
    score: 67,
    rationale: "Clear aims and references; no limitations section.",
    studyType: "narrative-review",
    model: "gemini-3.8-flash",
    promptVersion: SCORER_PROMPT_VERSION,
    textShortened: true,
    checks: [
      { id: "funding", answer: "shown", quote: "Funded by the Wellcome Trust." },
      {
        id: "limitations",
        answer: "missing",
        claimed: { answer: "shown", quote: "We acknowledge several limits." },
      },
    ],
  },
};

function show(initial: RatingView, local = false, ual: string | undefined = UAL) {
  render(
    <RatingProgress
      cid={CID}
      title="RNAi therapies"
      ual={ual}
      requestId={REQUEST_ID}
      initial={initial}
      local={local}
    />,
  );
}

/** The page as the Rate button opens it, before the chain shows the request. */
function showFresh() {
  render(
    <RatingProgress
      cid={CID}
      title="RNAi therapies"
      ual={UAL}
      requestId={REQUEST_ID}
      initial={{ ok: false, reason: "unavailable" }}
      local={false}
      fresh
    />,
  );
}

describe("RatingProgress", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a scored rating: the contract's score, the study type and each check", () => {
    show(SCORED);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Scored 67 / 100");
    expect(screen.getByTestId("rating-score").textContent).toBe("67");
    expect(screen.getByText(/Read as a narrative review/)).toBeTruthy();
    expect(screen.getByText("Clear aims and references; no limitations section.")).toBeTruthy();
    const funding = screen.getByText(/states who funded the work/).closest("li");
    expect(funding && within(funding).getByText("Shown")).toBeTruthy();
    expect(funding?.textContent).toMatch(/Funded by the Wellcome Trust\./);
    const limitations = screen.getByText(/discusses the limitations/).closest("li");
    expect(limitations?.textContent).toMatch(/The scorer claimed: Shown/);
    expect(limitations?.textContent).toMatch(/We acknowledge several limits\./);
    expect(limitations?.textContent).toMatch(/isn't in the paper's text/);
  });

  it("notes a shortened text, the model and prompt version, and links the R-KA and contract", () => {
    show(SCORED);

    expect(screen.getByText(/text was shortened/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`gemini-3.8-flash.*${SCORER_PROMPT_VERSION}`))).toBeTruthy();
    expect(screen.getByTitle(R_KA)).toBeTruthy();
    expect(
      screen
        .getAllByRole("link")
        .some((link) => link.getAttribute("href")?.endsWith(`/address/${CONTRACT}`)),
    ).toBe(true);
  });

  it("shows the contract address without a link on Anvil", () => {
    show(SCORED, true);

    expect(
      screen.getAllByRole("link").some((link) => link.getAttribute("href")?.includes("/address/")),
    ).toBe(false);
  });

  it("flags a gap between the contract's score and the R-KA's", () => {
    show({ ...SCORED, gap: true });

    expect(screen.getByRole("alert").textContent).toMatch(/R-KA records a different score/);
    expect(screen.getByTestId("rating-score").textContent).toBe("67");
  });

  it("keeps the contract's score when the R-KA can't be read", () => {
    show({
      ok: true,
      rating: SCORED.ok ? SCORED.rating : (RATING as never),
      recordProblem: "unavailable",
    });

    expect(screen.getByTestId("rating-score").textContent).toBe("67");
    expect(screen.getByText(/checks can't be loaded right now/)).toBeTruthy();
  });

  it("says why a cancelled rating stopped", () => {
    show({ ok: true, rating: { ...RATING, status: "cancelled", cancelReason: "invalid-target" } });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This paper can't be rated");
    expect(screen.getByText(/outside the life sciences/)).toBeTruthy();
    expect(screen.getByText(/the scoring model couldn't give a usable answer for it/)).toBeTruthy();
  });

  it("follows a pending rating every 5 s and stops once it is scored", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          rating: { ...RATING, status: "pending" },
          stage: "minting",
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => SCORED });
    vi.stubGlobal("fetch", fetchMock);

    show({ ok: true, rating: { ...RATING, status: "pending" }, stage: "scoring" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Reading the paper");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledWith(`/api/ratings/${REQUEST_ID}`, { cache: "no-store" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Minting the rating");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Scored 67 / 100");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a rating of another paper, read once the chain answers, as not found, and stops asking", async () => {
    vi.useFakeTimers();
    const other = { ...RATING, targetUal: `${UAL}0`, status: "pending" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, rating: other, stage: "scoring" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    show({ ok: false, reason: "unavailable" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("No rating here");
    expect(screen.getByText("This paper has no rating with this request id.")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits for a request the chain doesn't show yet, when opened right after it, then follows it to its score", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false, reason: "not-found" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          rating: { ...RATING, status: "pending" },
          stage: "scoring",
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => SCORED });
    vi.stubGlobal("fetch", fetchMock);

    showFresh();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Checking on this rating");
    const steps = within(screen.getByRole("list", { name: "Rating steps" })).getAllByRole(
      "listitem",
    );
    expect(steps.some((step) => step.textContent?.includes("(in progress)"))).toBe(false);
    expect(screen.getByRole("heading", { name: "What's happening" })).toBeTruthy();
    expect(screen.getByText(/asking again every few seconds/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Checking on this rating");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Reading the paper");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Scored 67 / 100");
  });

  it("says there is no rating here when the chain still doesn't show the request after 2 minutes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: false, reason: "not-found" }) });
    vi.stubGlobal("fetch", fetchMock);

    showFresh();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(115_000);
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Checking on this rating");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("No rating here");
    const asked = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(asked);
  });

  it("shows a rating it can't match to the paper, when the node didn't answer", () => {
    show(
      {
        ok: true,
        rating: { ...RATING, targetUal: `${UAL}0`, status: "pending" },
        stage: "scoring",
      },
      false,
      undefined,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Reading the paper");
  });

  it("shows a pending rating's steps, done ones first, each with what it does", () => {
    show({ ok: true, rating: { ...RATING, status: "pending" }, stage: "minting" });

    const steps = within(screen.getByRole("list", { name: "Rating steps" })).getAllByRole(
      "listitem",
    );
    expect(steps.map((step) => step.querySelector("p")?.textContent)).toEqual([
      "Scored",
      "Saved off-chain",
      "Minted on-chain (in progress)",
      "Recorded on-chain",
    ]);
    expect(screen.getAllByText(/OriginTrail's Knowledge Asset contracts/)).toHaveLength(2);
    expect(screen.getByText(/LabsTrail's RatingController contract/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Minting the rating");
  });

  it("says a paper outside the field stops at the first step", () => {
    show({ ok: true, rating: { ...RATING, status: "pending" }, stage: "scoring" });

    expect(
      screen.getByText(/outside the life sciences and health, the rating is cancelled/),
    ).toBeTruthy();
  });

  it("says when a pending rating was requested, and that it is taking long past 15 min", () => {
    vi.useFakeTimers();
    vi.setSystemTime(RATING.requestedAt * 1000 + 25 * 60_000);
    show({ ok: true, rating: { ...RATING, status: "pending" }, stage: "scoring" });

    expect(screen.getByText("Requested 25 min ago")).toBeTruthy();
    expect(screen.getByText(/taking longer than usual/)).toBeTruthy();
  });

  it("says nothing about a slow rating in its first minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(RATING.requestedAt * 1000 + 2 * 60_000);
    show({ ok: true, rating: { ...RATING, status: "pending" }, stage: "scoring" });

    expect(screen.getByText("Requested 2 min ago")).toBeTruthy();
    expect(screen.queryByText(/taking longer than usual/)).toBeNull();
  });

  it("says why the paper's title and checks are missing when the node didn't answer", () => {
    render(
      <RatingProgress
        cid={CID}
        title="bafybe…6b6m"
        requestId={REQUEST_ID}
        initial={{ ok: true, rating: { ...RATING, status: "pending" }, stage: "scoring" }}
        local={false}
        nodeDown
      />,
    );

    expect(screen.getByRole("status").textContent).toMatch(/node isn't answering/);
    expect(screen.getByRole("status").textContent).toMatch(/score comes from the chain/);
  });

  it("asks nothing for a rating that is already final", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    show(SCORED);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
