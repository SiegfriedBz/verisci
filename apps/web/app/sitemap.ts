import { getUploadService } from "@labstrail/workflows";
import type { MetadataRoute } from "next";
import { sitemapFor } from "../lib/seo/crawl.ts";
import { createWebEnv } from "../lib/web-env.ts";

/**
 * Rendered on request, so a build reads no settings and asks no node (ADR 0004); crawlers
 * fetch a sitemap seldom.
 */
export const dynamic = "force-dynamic";

/** `/sitemap.xml`: the site's pages and every published paper on production (`sitemapFor`). */
export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapFor(createWebEnv(), {
    listPapers: (options) => getUploadService().listPapers(options),
    logger: console,
  });
}
