import type { PaperListResult, PublishLogger } from "@labstrail/workflows";
import type { MetadataRoute } from "next";
import type { WebEnv } from "../web-env.ts";
import { siteUrl } from "./site-metadata.ts";

/** The site's own pages, which the sitemap lists before the papers. */
export const SITE_PAGES = ["/", "/papers", "/publish", "/method", "/about"] as const;

/** The largest page `listPapers` reads, so the sitemap asks the node as few times as it can. */
const PAGE_SIZE = 50;

/** What {@link sitemapFor} reads with: the upload service's list, and the server's log. */
export interface SitemapDeps {
  listPapers(options: {
    readonly page: number;
    readonly pageSize: number;
  }): Promise<PaperListResult>;
  readonly logger: Pick<PublishLogger, "warn">;
}

/**
 * `/robots.txt` (ADR 0040): on production, every crawler may read every page but the API,
 * and the sitemap is named; elsewhere every crawler is kept out.
 */
export function robotsFor(env: WebEnv): MetadataRoute.Robots {
  if (env.APP_ENV !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${siteUrl(env)}/sitemap.xml`,
  };
}

/**
 * `/sitemap.xml` on production (ADR 0040): the site's own pages, then each published paper's
 * page with its mint date, read page by page from the node. When the node does not answer, the
 * papers read so far stay and the server logs `sitemap-papers-unavailable: <reason>` once.
 * Lists nothing elsewhere, where crawlers are kept out.
 */
export async function sitemapFor(env: WebEnv, deps: SitemapDeps): Promise<MetadataRoute.Sitemap> {
  if (env.APP_ENV !== "production") return [];
  const site = siteUrl(env);
  const entries: MetadataRoute.Sitemap = SITE_PAGES.map((path) => ({
    url: path === "/" ? site : `${site}${path}`,
  }));
  for (let page = 1, listed = 0; ; page++) {
    const answer = await deps.listPapers({ page, pageSize: PAGE_SIZE });
    if (!answer.ok) {
      deps.logger.warn(`sitemap-papers-unavailable: ${answer.reason}`);
      return entries;
    }
    for (const paper of answer.papers) {
      entries.push({ url: `${site}/papers/${paper.cid}`, lastModified: paper.publishedAt });
    }
    listed += answer.papers.length;
    if (answer.papers.length === 0 || listed >= answer.total) return entries;
  }
}
