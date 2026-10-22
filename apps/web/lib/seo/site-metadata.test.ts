import { describe, expect, it } from "vitest";
import { SITE } from "../site.ts";
import { createWebEnv } from "../web-env.ts";
import { siteMetadata, siteUrl } from "./site-metadata.ts";

const deployed = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "secret-upstash-token",
  REOWN_PROJECT_ID: "0123456789abcdef0123456789abcdef",
  VERCEL_PROJECT_PRODUCTION_URL: "labstrail.vercel.app",
  VERCEL_BRANCH_URL: "labstrail-git-develop-siegfriedbzs-projects.vercel.app",
};
const production = createWebEnv({ ...deployed, APP_ENV: "production" });
const staging = createWebEnv({ ...deployed, APP_ENV: "staging" });
const local = createWebEnv({ APP_ENV: "local" });

describe("siteUrl", () => {
  it("is production's domain on production, the branch's URL on staging, localhost locally", () => {
    expect(siteUrl(production)).toBe("https://labstrail.vercel.app");
    expect(siteUrl(staging)).toBe("https://labstrail-git-develop-siegfriedbzs-projects.vercel.app");
    expect(siteUrl(local)).toBe("http://localhost:3000");
  });
});

describe("siteMetadata", () => {
  it("resolves every page's links against the site's address", () => {
    expect(siteMetadata(production).metadataBase).toEqual(new URL("https://labstrail.vercel.app"));
    expect(siteMetadata(local).metadataBase).toEqual(new URL("http://localhost:3000"));
  });

  it("lets crawlers index production only", () => {
    expect(siteMetadata(production).robots).toBeUndefined();
    expect(siteMetadata(staging).robots).toEqual({ index: false, follow: false });
    expect(siteMetadata(local).robots).toEqual({ index: false, follow: false });
  });

  it("titles pages after the site, with a home title that says what LabsTrail is", () => {
    const { title } = siteMetadata(production);

    expect(title).toEqual({ default: SITE.title, template: "%s · LabsTrail" });
    expect(SITE.title).toMatch(/^LabsTrail: .*ratings/);
    expect(SITE.title.length).toBeLessThanOrEqual(60);
  });

  it("gives each page its own path as canonical, and a large share card", () => {
    const metadata = siteMetadata(production);

    expect(metadata.alternates).toEqual({ canonical: "./" });
    expect(metadata.description).toBe(SITE.description);
    expect(metadata.twitter).toEqual({ card: "summary_large_image" });
  });

  it("lets each page's own title and description fill its share card", () => {
    expect(siteMetadata(production).openGraph).toEqual({
      siteName: "LabsTrail",
      type: "website",
      url: "./",
    });
  });
});
