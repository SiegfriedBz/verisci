import type { PaperListResult, PaperSummary } from "@labstrail/workflows";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listPapers =
  vi.fn<(options: { page: number; pageSize: number }) => Promise<PaperListResult>>();

const getUploadService = vi.fn(() => ({ listPapers }));

vi.mock("@labstrail/workflows", () => ({ getUploadService: () => getUploadService() }));

const { LatestPapers } = await import("./latest-papers.tsx");

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

describe("LatestPapers", () => {
  afterEach(() => {
    cleanup();
    listPapers.mockReset();
  });

  it("says the papers can't be loaded, and logs why, when the settings are missing", async () => {
    const setup = new Error("DKG_URL is missing");
    getUploadService.mockImplementationOnce(() => {
      throw setup;
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    render(await LatestPapers());

    expect(screen.getByRole("alert").textContent).toContain("can't be loaded right now");
    expect(logged).toHaveBeenCalledWith("latest papers:", setup);
    logged.mockRestore();
  });

  it("shows the five newest and links to all of them with the total", async () => {
    listPapers.mockResolvedValue({ ok: true, total: 42, papers: [PAPER] });

    render(await LatestPapers());

    expect(listPapers).toHaveBeenCalledWith({ page: 1, pageSize: 5 });
    expect(screen.getByRole("link", { name: PAPER.title })).toBeTruthy();
    expect(screen.getByRole("link", { name: "All 42 papers" }).getAttribute("href")).toBe(
      "/papers",
    );
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
  });

  it("says when no paper is published yet", async () => {
    listPapers.mockResolvedValue({ ok: true, total: 0, papers: [] });

    render(await LatestPapers());

    expect(screen.getByText(/No paper is published yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Publish the first one/ }).getAttribute("href")).toBe(
      "/publish",
    );
  });

  it.each(["unavailable", "unreadable"] as const)(
    "says only this block can't be loaded when the list is %s",
    async (reason) => {
      listPapers.mockResolvedValue({ ok: false, reason });

      render(await LatestPapers());

      expect(screen.getByRole("alert").textContent).toMatch(/can't be loaded right now/);
    },
  );
});
