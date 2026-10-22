import type { PaperListResult, PaperSummary } from "@labstrail/workflows";
import { describe, expect, it, vi } from "vitest";
import { createWebEnv } from "../web-env.ts";
import { robotsFor, sitemapFor } from "./crawl.ts";

const deployed = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "secret-upstash-token",
  REOWN_PROJECT_ID: "0123456789abcdef0123456789abcdef",
  VERCEL_PROJECT_PRODUCTION_URL: "labstrail.vercel.app",
  VERCEL_BRANCH_URL: "labstrail-git-develop-siegfriedbzs-projects.vercel.app",
};
const production = createWebEnv({ ...deployed, APP_ENV: "production" });
const staging = createWebEnv({ ...deployed, APP_ENV: "staging" });
const SITE = "https://labstrail.vercel.app";

function paper(cid: string, publishedAt: string): PaperSummary {
  return {
    cid,
    ual: `did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/${cid.length}`,
    publishedAt,
    title: `Paper ${cid}`,
    authors: ["Di Liu"],
    authorCount: 1,
    submitter: "0x9a17000000000000000000000000000000009111",
    signatureCheck: "valid",
  };
}

const STATIC_PAGES = [
  { url: SITE },
  { url: `${SITE}/papers` },
  { url: `${SITE}/publish` },
  { url: `${SITE}/method` },
  { url: `${SITE}/about` },
];

describe("robotsFor", () => {
  it("lets every crawler in on production, except the API, and names the sitemap", () => {
    expect(robotsFor(production)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: `${SITE}/sitemap.xml`,
    });
  });

  it("keeps every crawler out elsewhere, with no sitemap", () => {
    expect(robotsFor(staging)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(robotsFor(createWebEnv({ APP_ENV: "local" }))).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    });
  });
});

describe("sitemapFor", () => {
  it("lists the site's pages, then every published paper with its mint date, page by page", async () => {
    const pages: PaperListResult[] = [
      {
        ok: true,
        total: 51,
        papers: Array.from({ length: 50 }, (_, i) => paper(`a${i}`, "2026-10-17T08:00:00.000Z")),
      },
      { ok: true, total: 51, papers: [paper("last", "2026-10-18T09:30:00.000Z")] },
    ];
    const listPapers = vi.fn(async ({ page }: { page: number; pageSize: number }) => {
      const answer = pages[page - 1];
      if (!answer) throw new Error(`no page ${page}`);
      return answer;
    });
    const warn = vi.fn();

    const entries = await sitemapFor(production, { listPapers, logger: { warn } });

    expect(listPapers.mock.calls.map(([options]) => options)).toEqual([
      { page: 1, pageSize: 50 },
      { page: 2, pageSize: 50 },
    ]);
    expect(entries.slice(0, 5)).toEqual(STATIC_PAGES);
    expect(entries).toHaveLength(56);
    expect(entries.at(-1)).toEqual({
      url: `${SITE}/papers/last`,
      lastModified: "2026-10-18T09:30:00.000Z",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("still lists the site's pages when the node does not answer, and says so once", async () => {
    const warn = vi.fn();

    const entries = await sitemapFor(production, {
      listPapers: async () => ({ ok: false, reason: "unavailable" }),
      logger: { warn },
    });

    expect(entries).toEqual(STATIC_PAGES);
    expect(warn.mock.calls).toEqual([["sitemap-papers-unavailable: unavailable"]]);
  });

  it("lists nothing outside production, and asks the node nothing", async () => {
    const listPapers = vi.fn();

    expect(await sitemapFor(staging, { listPapers, logger: { warn: vi.fn() } })).toEqual([]);
    expect(listPapers).not.toHaveBeenCalled();
  });
});
