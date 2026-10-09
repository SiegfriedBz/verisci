import { describe, expect, it } from "vitest";
import { attentionTei } from "./fixtures/attention-tei.ts";
import { parseTeiHeader } from "./tei.ts";

/** A minimal GROBID header; `analytic` and `profile` are spliced into it. */
function tei({ analytic = "", profile = "" }: { analytic?: string; profile?: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title level="a" type="main">A Title</title></titleStmt>
      <sourceDesc><biblStruct><analytic>${analytic}</analytic></biblStruct></sourceDesc>
    </fileDesc>
    <profileDesc>${profile}</profileDesc>
  </teiHeader>
</TEI>`;
}

describe("parseTeiHeader", () => {
  it("reads the title, the authors in order and the abstract of a GROBID header", () => {
    const result = parseTeiHeader(attentionTei);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.title).toBe("Attention Is All You Need");
    expect(result.metadata.authors).toEqual([
      "Ashish Vaswani",
      "Google Brain",
      "Noam Shazeer",
      "Niki Parmar",
      "Google Research",
      "Jakob Uszkoreit",
      "Llion Jones",
      "Aidan N Gomez",
      "Łukasz Kaiser",
      "Illia Polosukhin",
    ]);
    expect(result.metadata.abstract).toMatch(/^The dominant sequence transduction models/);
    expect(result.metadata.abstract).toMatch(/Work performed while at Google Brain\.$/);
    expect(result.metadata.doi).toBeUndefined();
  });

  it.each([
    ["10.1000/XYZ.123", "10.1000/xyz.123"],
    ["https://doi.org/10.1000/abc", "10.1000/abc"],
    ["doi:10.1000/abc", "10.1000/abc"],
    [" DOI:10.1000/ABC ", "10.1000/abc"],
  ])("reads the DOI %s as %s", (idno, doi) => {
    const result = parseTeiHeader(tei({ analytic: `<idno type="DOI">${idno}</idno>` }));

    expect(result).toMatchObject({ ok: true, metadata: { doi } });
  });

  it("collapses whitespace and line breaks inside a field and trims it", () => {
    const result = parseTeiHeader(
      tei({
        analytic: `<author><persName><forename>  Ada\n</forename>
          <surname> Lovelace </surname></persName></author>`,
        profile: "<abstract><p>  One\n\n  line. </p><p>Two\tlines.</p></abstract>",
      }),
    );

    expect(result).toEqual({
      ok: true,
      metadata: { title: "A Title", authors: ["Ada Lovelace"], abstract: "One line. Two lines." },
    });
  });

  it("is ok with no abstract and no authors", () => {
    expect(parseTeiHeader(tei({}))).toEqual({
      ok: true,
      metadata: { title: "A Title", authors: [] },
    });
  });

  it("skips an author with no name", () => {
    const result = parseTeiHeader(
      tei({
        analytic:
          "<author><email>a@b.c</email></author><author><persName><surname>Lee</surname></persName></author>",
      }),
    );

    expect(result).toMatchObject({ ok: true, metadata: { authors: ["Lee"] } });
  });

  it.each([
    ["missing", tei({}).replace(/<titleStmt>.*<\/titleStmt>/, "<titleStmt/>")],
    ["empty", tei({}).replace("A Title", "  \n ")],
  ])("refuses a header whose title is %s", (_, xml) => {
    expect(parseTeiHeader(xml)).toEqual({ ok: false, reason: "no-title" });
  });

  it.each([
    ["empty input", ""],
    ["plain text", "not xml at all"],
    ["broken XML", "<TEI><teiHeader>"],
    ["XML that is not TEI", "<html><head><title>A Title</title></head></html>"],
    ["TEI with no header", '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text/></TEI>'],
  ])("refuses %s as not-tei", (_, xml) => {
    expect(parseTeiHeader(xml)).toEqual({ ok: false, reason: "not-tei" });
  });
});
