import type { PaperListResult, PaperSummary } from "@labstrail/workflows";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listPapers =
  vi.fn<(options: { page: number; pageSize: number }) => Promise<PaperListResult>>();

vi.mock("@labstrail/workflows", () => ({ getUploadService: () => ({ listPapers }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { PapersResults } = await import("./papers-results.tsx");

const PAPER: PaperSummary = {
  cid: "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m",
  ual: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/9",
  publishedAt: "2026-10-10T15:14:13.222Z",
  title: "TEAD4 Regulates apical domain homeostasis",
  authors: ["Alexander W Bruce"],
  authorCount: 1,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signatureCheck: "valid",
};

async function show(page: number) {
  render(await PapersResults({ page }));
}

describe("PapersResults", () => {
  afterEach(() => {
    cleanup();
    listPapers.mockReset();
  });

  it("reads only the page asked for, and shows it with the total and the pages", async () => {
    listPapers.mockResolvedValue({ ok: true, total: 42, papers: [PAPER] });

    await show(2);

    expect(listPapers).toHaveBeenCalledWith({ page: 2, pageSize: 20 });
    expect(screen.getByText("42 papers · page 2 of 3")).toBeTruthy();
    expect(screen.getByRole("link", { name: PAPER.title })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeTruthy();
  });

  it("counts one paper in the singular, with no pager", async () => {
    listPapers.mockResolvedValue({ ok: true, total: 1, papers: [PAPER] });

    await show(1);

    expect(screen.getByText("1 paper")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
  });

  it("shows the not-found page past the last page", async () => {
    listPapers.mockResolvedValue({ ok: true, total: 42, papers: [] });

    await expect(show(4)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("says when no paper is published yet, and links to publishing", async () => {
    listPapers.mockResolvedValue({ ok: true, total: 0, papers: [] });

    await show(1);

    expect(screen.getByText(/No paper is published yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Publish the first one/ }).getAttribute("href")).toBe(
      "/publish",
    );
  });

  it("says the list can't be loaded when the node does not answer, and offers to try again", async () => {
    listPapers.mockResolvedValue({ ok: false, reason: "unavailable" });

    await show(2);

    expect(screen.getByRole("alert").textContent).toMatch(/can't be loaded right now/);
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe(
      "/papers?page=2",
    );
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
  });

  it("says the list can't be read when the node's answer does not parse", async () => {
    listPapers.mockResolvedValue({ ok: false, reason: "unreadable" });

    await show(1);

    expect(screen.getByRole("alert").textContent).toMatch(/couldn't be read/);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
  });
});
