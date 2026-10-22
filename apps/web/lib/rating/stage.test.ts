import type { RatingView } from "@labstrail/workflows";
import { describe, expect, it } from "vitest";
import { isFinalRating, isRequestId, newRatingPath, ratingStage, whileFresh } from "./stage.ts";

const RATING = {
  requestId: `0x${"ab".repeat(32)}`,
  contract: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
  requestedAt: 1_791_900_000,
  targetUal: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7",
};

function pending(stage: "scoring" | "saving" | "minting" | "recording" | "unknown"): RatingView {
  return { ok: true, rating: { ...RATING, status: "pending" }, stage };
}

describe("ratingStage", () => {
  it.each(["scoring", "saving", "minting", "recording"] as const)(
    "shows a pending rating's %s stage",
    (stage) => {
      expect(ratingStage(pending(stage))).toEqual({ stage });
    },
  );

  it("shows a pending rating the node did not answer for as unavailable", () => {
    expect(ratingStage(pending("unknown"))).toEqual({ stage: "unavailable" });
  });

  it("shows a fulfilled rating as scored, with the contract's score", () => {
    expect(
      ratingStage({ ok: true, rating: { ...RATING, status: "fulfilled", score: 67, rKaUal: "x" } }),
    ).toEqual({ stage: "scored", score: 67 });
  });

  it.each(["invalid-target", "expired"] as const)("shows a %s cancel with its reason", (reason) => {
    expect(
      ratingStage({ ok: true, rating: { ...RATING, status: "cancelled", cancelReason: reason } }),
    ).toEqual({ stage: "cancelled", reason });
  });

  it.each(["not-found", "unavailable"] as const)("shows a read that is %s", (reason) => {
    expect(ratingStage({ ok: false, reason })).toEqual({ stage: reason });
  });
});

describe("isFinalRating", () => {
  it("stops following on scored, cancelled and not-found", () => {
    expect(isFinalRating({ stage: "scored", score: 1 })).toBe(true);
    expect(isFinalRating({ stage: "cancelled", reason: "expired" })).toBe(true);
    expect(isFinalRating({ stage: "not-found" })).toBe(true);
  });

  it.each(["scoring", "saving", "minting", "recording", "unavailable"] as const)(
    "keeps following through %s",
    (stage) => {
      expect(isFinalRating({ stage })).toBe(false);
    },
  );
});

describe("isRequestId", () => {
  it("takes 0x and 64 hex digits, any case", () => {
    expect(isRequestId(`0x${"Ab".repeat(32)}`)).toBe(true);
  });

  it.each(["0x12", `${"ab".repeat(32)}`, `0x${"zz".repeat(32)}`])("refuses %s", (value) => {
    expect(isRequestId(value)).toBe(false);
  });
});

describe("newRatingPath", () => {
  it("opens a rating's page marked as just requested", () => {
    expect(newRatingPath("bafy1", RATING.requestId)).toBe(
      `/papers/bafy1/ratings/${RATING.requestId}?new=1`,
    );
  });
});

describe("whileFresh", () => {
  it("reads a request the chain doesn't show yet as waiting, while the page is fresh", () => {
    expect(whileFresh({ ok: false, reason: "not-found" }, true)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("leaves not-found as it is once the page is no longer fresh", () => {
    expect(whileFresh({ ok: false, reason: "not-found" }, false)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("leaves a rating the chain shows as it is", () => {
    const view = pending("scoring");
    expect(whileFresh(view, true)).toBe(view);
  });
});
