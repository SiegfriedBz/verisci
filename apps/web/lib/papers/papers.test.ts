import type { PaperListResult, PaperSummary } from "@labstrail/workflows";
import { describe, expect, it } from "vitest";
import {
  authorsLine,
  formatPublished,
  PAPERS_PER_PAGE,
  pageCount,
  pageHref,
  pageLinks,
  papersView,
  parsePageParam,
  signatureLabel,
} from "./papers.ts";

const PAPER: PaperSummary = {
  cid: "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m",
  ual: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/9",
  publishedAt: "2026-10-10T15:14:13.222Z",
  title: "TEAD4 Regulates apical domain homeostasis",
  authors: ["Alexander W Bruce", "Rebecca Collier", "Martina Bohuslavová"],
  authorCount: 10,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signatureCheck: "valid",
};

describe("parsePageParam", () => {
  it("reads no page as page 1, and a positive whole number as that page", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("2")).toBe(2);
    expect(parsePageParam("120")).toBe(120);
  });

  it.each([["0"], ["-1"], ["01"], ["1.5"], ["abc"], [""], ["1e3"], ["9007199254740993"]])(
    "refuses %j",
    (value) => {
      expect(parsePageParam(value)).toBeUndefined();
    },
  );

  it("refuses a repeated page", () => {
    expect(parsePageParam(["1", "2"])).toBeUndefined();
  });

  it("refuses a page whose page × 20 is past the largest safe integer", () => {
    expect(parsePageParam("450359962737049")).toBe(450_359_962_737_049);
    expect(parsePageParam("450359962737050")).toBeUndefined();
  });
});

describe("pageCount", () => {
  it("counts the pages a total fills, at least one", () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(42, 20)).toBe(3);
  });
});

describe("pageLinks", () => {
  it("gives no pager for a single page", () => {
    expect(pageLinks(1, 1)).toEqual([]);
  });

  it("gives every number up to 7 pages", () => {
    expect(pageLinks(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("gives the first, the last and the current page's neighbours, with gaps, beyond 7", () => {
    expect(pageLinks(1, 12)).toEqual([1, 2, "gap", 12]);
    expect(pageLinks(3, 12)).toEqual([1, 2, 3, 4, "gap", 12]);
    expect(pageLinks(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageLinks(12, 12)).toEqual([1, "gap", 11, 12]);
  });
});

describe("pageHref", () => {
  it("links page 1 to /papers and the others with ?page=", () => {
    expect(pageHref(1)).toBe("/papers");
    expect(pageHref(3)).toBe("/papers?page=3");
  });
});

describe("formatPublished", () => {
  it("gives the day in UTC", () => {
    expect(formatPublished("2026-10-10T15:14:13.222Z")).toBe("10 Oct 2026");
    expect(formatPublished("2026-10-10T23:59:59.000Z")).toBe("10 Oct 2026");
  });
});

describe("authorsLine", () => {
  it("names the first authors and how many more there are", () => {
    expect(authorsLine(PAPER)).toBe(
      "Alexander W Bruce, Rebecca Collier, Martina Bohuslavová +7 more",
    );
    expect(authorsLine({ ...PAPER, authors: ["Di Liu"], authorCount: 1 })).toBe("Di Liu");
  });

  it("says when no author was read", () => {
    expect(authorsLine({ ...PAPER, authors: [], authorCount: 0 })).toBe("No authors listed");
  });

  it("says how many authors there are when none could be named", () => {
    expect(authorsLine({ ...PAPER, authors: [], authorCount: 10 })).toBe("10 authors");
    expect(authorsLine({ ...PAPER, authors: [], authorCount: 1 })).toBe("1 author");
  });
});

describe("signatureLabel", () => {
  it("words each signature check", () => {
    expect(signatureLabel("valid")).toBe("Valid");
    expect(signatureLabel("invalid")).toBe("Doesn't match");
    expect(signatureLabel("unknown")).toBe("Not checked");
  });
});

describe("papersView", () => {
  const listed = (total: number, papers: PaperSummary[]): PaperListResult => ({
    ok: true,
    total,
    papers,
  });

  it("gives the list with its page and last page", () => {
    expect(papersView(listed(42, [PAPER]), 3)).toEqual({
      kind: "list",
      papers: [PAPER],
      total: 42,
      page: 3,
      lastPage: 3,
    });
    expect(PAPERS_PER_PAGE).toBe(20);
  });

  it("is empty on page 1 with no papers", () => {
    expect(papersView(listed(0, []), 1)).toEqual({ kind: "empty" });
  });

  it("is not found past the last page, or on any later page with no papers", () => {
    expect(papersView(listed(42, [PAPER]), 4)).toEqual({ kind: "not-found" });
    expect(papersView(listed(0, []), 2)).toEqual({ kind: "not-found" });
    expect(papersView(listed(42, []), 2)).toEqual({ kind: "not-found" });
  });

  it("passes on why the list cannot be shown", () => {
    expect(papersView({ ok: false, reason: "unavailable" }, 1)).toEqual({ kind: "unavailable" });
    expect(papersView({ ok: false, reason: "unreadable" }, 1)).toEqual({ kind: "unreadable" });
  });
});
