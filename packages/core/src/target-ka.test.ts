import { describe, expect, it } from "vitest";
import { targetKaQuads } from "./target-ka.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const PAPER = `urn:verisci:paper:${CID}`;
const SCHEMA = "http://schema.org/";
const INTEGER = "<http://www.w3.org/2001/XMLSchema#integer>";
const submission = {
  cid: CID,
  submitter: "0xAbC0000000000000000000000000000000000001",
  signature: "0x1234",
  deadline: 1_800_000_000n,
};
const metadata = {
  title: "A Title",
  authors: ["Ada Lovelace", "Alan Turing"],
  abstract: "An abstract.",
  doi: "10.1000/abc",
};

describe("targetKaQuads", () => {
  it("describes the paper, its authors and its submission", () => {
    expect(targetKaQuads(metadata, submission)).toEqual([
      {
        subject: PAPER,
        predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        object: `${SCHEMA}ScholarlyArticle`,
      },
      { subject: PAPER, predicate: `${SCHEMA}name`, object: '"A Title"' },
      { subject: PAPER, predicate: `${SCHEMA}url`, object: `ipfs://${CID}` },
      { subject: PAPER, predicate: `${SCHEMA}abstract`, object: '"An abstract."' },
      { subject: PAPER, predicate: `${SCHEMA}sameAs`, object: "https://doi.org/10.1000/abc" },
      { subject: PAPER, predicate: `${SCHEMA}author`, object: `${PAPER}/author/1` },
      { subject: `${PAPER}/author/1`, predicate: `${SCHEMA}name`, object: '"Ada Lovelace"' },
      { subject: `${PAPER}/author/1`, predicate: `${SCHEMA}position`, object: `"1"^^${INTEGER}` },
      { subject: PAPER, predicate: `${SCHEMA}author`, object: `${PAPER}/author/2` },
      { subject: `${PAPER}/author/2`, predicate: `${SCHEMA}name`, object: '"Alan Turing"' },
      { subject: `${PAPER}/author/2`, predicate: `${SCHEMA}position`, object: `"2"^^${INTEGER}` },
      {
        subject: PAPER,
        predicate: "urn:verisci:submitter",
        object: '"0xabc0000000000000000000000000000000000001"',
      },
      { subject: PAPER, predicate: "urn:verisci:signature", object: '"0x1234"' },
      { subject: PAPER, predicate: "urn:verisci:deadline", object: `"1800000000"^^${INTEGER}` },
    ]);
  });

  it("produces no quad for a missing DOI, abstract or author", () => {
    const quads = targetKaQuads({ title: "A Title", authors: [] }, submission);
    const predicates = quads.map((quad) => quad.predicate);

    expect(predicates).not.toContain(`${SCHEMA}sameAs`);
    expect(predicates).not.toContain(`${SCHEMA}abstract`);
    expect(predicates).not.toContain(`${SCHEMA}author`);
    expect(quads).toHaveLength(6);
  });

  it("writes no sameAs for a DOI that is not one", () => {
    const quads = targetKaQuads({ ...metadata, doi: "10.1000/x> <urn:a> <urn:b" }, submission);

    expect(quads.map((quad) => quad.predicate)).not.toContain(`${SCHEMA}sameAs`);
  });

  it("escapes quotes, backslashes and line breaks in a literal", () => {
    const quads = targetKaQuads(
      { title: 'A "quoted" \\ title\r\non two lines', authors: [] },
      submission,
    );

    expect(quads.find((quad) => quad.predicate === `${SCHEMA}name`)?.object).toBe(
      '"A \\"quoted\\" \\\\ title\\r\\non two lines"',
    );
  });

  it("returns equal quads in the same order for the same input", () => {
    expect(targetKaQuads(metadata, submission)).toEqual(targetKaQuads(metadata, submission));
  });
});
