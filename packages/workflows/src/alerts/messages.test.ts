import { describe, expect, it } from "vitest";
import { publishedNotice, ratedNotice, siteUrlOf } from "./messages.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const TARGET = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const REQUEST_ID = `0x${"ab".repeat(32)}`;
const SITE = "https://labstrail.example";

describe("siteUrlOf", () => {
  it("gives the address a message links to: production's, develop's branch URL, or localhost", () => {
    expect(
      siteUrlOf({ APP_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "labstrail.example" }),
    ).toBe("https://labstrail.example");
    expect(
      siteUrlOf({ APP_ENV: "staging", VERCEL_BRANCH_URL: "labstrail-git-develop.vercel.app" }),
    ).toBe("https://labstrail-git-develop.vercel.app");
    expect(siteUrlOf({ APP_ENV: "local" })).toBe("http://localhost:3000");
  });

  it("is undefined when Vercel gave no address, so messages carry no link", () => {
    expect(siteUrlOf({ APP_ENV: "production" })).toBeUndefined();
    expect(siteUrlOf({ APP_ENV: "staging" })).toBeUndefined();
  });
});

describe("publishedNotice", () => {
  it("names the paper by its title, with a short link to its page", () => {
    expect(publishedNotice({ cid: CID, title: "RNAi therapies" }, SITE)).toEqual({
      level: "activity",
      text: "📄 Published",
      title: "RNAi therapies",
      link: { label: "Open the paper", url: `${SITE}/papers/${CID}` },
    });
  });

  it("names it by its CID when the run didn't read the title, and leaves the link out without a site", () => {
    expect(publishedNotice({ cid: CID }, undefined)).toEqual({
      level: "activity",
      text: "📄 Published",
      title: CID,
    });
  });

  it("names it by its CID when its title is empty", () => {
    expect(publishedNotice({ cid: CID, title: "" }, undefined).title).toBe(CID);
  });
});

describe("ratedNotice", () => {
  const paper = { requestId: REQUEST_ID, targetUal: TARGET, cid: CID, title: "RNAi therapies" };

  it("gives a score out of 100, the paper and a short link to the rating's page", () => {
    expect(ratedNotice({ state: "fulfilled", score: 67 }, paper, SITE)).toEqual({
      level: "activity",
      text: "⭐ Rated 67/100",
      title: "RNAi therapies",
      link: { label: "Open the rating", url: `${SITE}/papers/${CID}/ratings/${REQUEST_ID}` },
    });
  });

  it.each([
    ["invalid-target", "can't be rated"],
    ["expired", "not finished within a day"],
  ] as const)("says why a rating was cancelled %s", (reason, words) => {
    expect(ratedNotice({ state: "cancelled", reason }, paper, undefined)).toEqual({
      level: "activity",
      text: `⚠️ Rating cancelled: ${words}`,
      title: "RNAi therapies",
    });
  });

  it("names a paper it never read by its UAL, with no link", () => {
    expect(
      ratedNotice(
        { state: "cancelled", reason: "invalid-target" },
        { requestId: REQUEST_ID, targetUal: TARGET },
        SITE,
      ),
    ).toEqual({ level: "activity", text: "⚠️ Rating cancelled: can't be rated", title: TARGET });
  });

  it("names a paper whose title is empty by its UAL", () => {
    expect(
      ratedNotice({ state: "fulfilled", score: 64 }, { ...paper, title: "" }, undefined).title,
    ).toBe(TARGET);
  });
});
