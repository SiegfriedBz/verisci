import { siteUrlOf } from "@labstrail/workflows";
import type { Metadata } from "next";
import { SITE } from "../site.ts";
import type { WebEnv } from "../web-env.ts";

/** Where the site runs when Vercel gave no address: the dev server. */
const LOCAL_URL = "http://localhost:3000";

/**
 * The site's address, which its canonical links, sitemap and structured data are absolute
 * against: production's domain, the branch's URL on staging, the dev server locally
 * (`siteUrlOf`, the address notifications link to).
 */
export function siteUrl(env: WebEnv): string {
  return siteUrlOf(env) ?? LOCAL_URL;
}

/**
 * The layout's metadata: the site's address as every link's base, the home page's title and
 * the template other pages' titles fill, each page's own path as its canonical and share URL
 * (`"./"` drops the query), the description, Open Graph and a large Twitter card. The share
 * blocks set no title or description, so Next fills them from each page's own; their image
 * is `app/opengraph-image.tsx`, or a segment's own. Crawlers may index production only
 * (ADR 0040).
 */
export function siteMetadata(env: WebEnv): Metadata {
  return {
    metadataBase: new URL(siteUrl(env)),
    title: { default: SITE.title, template: `%s · ${SITE.name}` },
    description: SITE.description,
    alternates: { canonical: "./" },
    openGraph: { siteName: SITE.name, type: "website", url: "./" },
    twitter: { card: "summary_large_image" },
    ...(env.APP_ENV === "production" ? {} : { robots: { index: false, follow: false } }),
  };
}
