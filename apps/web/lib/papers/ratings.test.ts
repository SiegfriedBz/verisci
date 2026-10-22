import type { PaperSummary } from "@labstrail/workflows";
import { describe, expect, it, vi } from "vitest";
import { withRatings } from "./ratings.ts";

const paper = (n: number): PaperSummary => ({
  cid: `bafy${n}`,
  ual: `did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/${n}`,
  publishedAt: "2026-10-10T15:14:13.222Z",
  title: `Paper ${n}`,
  authors: [],
  authorCount: 0,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signatureCheck: "valid",
});

describe("withRatings", () => {
  it("gives each paper its rating summary, asked for all the page's UALs at once", async () => {
    const summaries = vi.fn(async () => [
      { kind: "scored" as const, score: 67, requestId: "0x1" },
      { kind: "pending" as const },
    ]);

    const rows = await withRatings([paper(7), paper(8)], summaries);

    expect(summaries).toHaveBeenCalledWith([paper(7).ual, paper(8).ual]);
    expect(rows.map((row) => row.rating)).toEqual([
      { kind: "scored", score: 67, requestId: "0x1" },
      { kind: "pending" },
    ]);
    expect(rows.every((row) => row.canRate)).toBe(true);
  });

  it("calls every paper unrated, and not rateable, where no contract takes ratings", async () => {
    const rows = await withRatings([paper(7)], undefined);

    expect(rows[0]?.rating).toEqual({ kind: "unrated" });
    expect(rows[0]?.canRate).toBe(false);
  });

  it("calls every paper unknown when the read fails", async () => {
    const rows = await withRatings([paper(7)], async () => {
      throw new Error("EnvError");
    });

    expect(rows[0]?.rating).toEqual({ kind: "unknown" });
  });
});
