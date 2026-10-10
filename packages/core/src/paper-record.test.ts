import { describe, expect, it } from "vitest";
import { paperRecordQuery, parsePaperRecord, type QueryBinding } from "./paper-record.ts";
import { type PaperSubmission, targetKaQuads } from "./target-ka.ts";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
const SUBMISSION: PaperSubmission = {
  cid: CID,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signature: "0xefa5",
  deadline: 1_791_639_162n,
};
const METADATA = {
  title: 'Screening "VP1" of deformed wing virus\nin bees',
  authors: ["Di Liu", "Yuting Xiao", "Dongliang Fei"],
  abstract: "Deformed wing virus (DWV) is a major viral pathogen.",
  doi: "10.3389/fmicb.2026.1860293",
};

/** The rows the node's SPARQL answer gives for the query, built from the triples we write. */
function bindingsFor(triples: ReturnType<typeof targetKaQuads>): QueryBinding[] {
  const paper = `urn:verisci:paper:${CID}`;
  return triples
    .filter((triple) => triple.subject === paper)
    .map((triple) => {
      const name = triples.find(
        (t) => t.subject === triple.object && t.predicate === "http://schema.org/name",
      );
      const position = triples.find(
        (t) => t.subject === triple.object && t.predicate === "http://schema.org/position",
      );
      return {
        p: triple.predicate,
        o: triple.object,
        ...(name && position ? { authorName: name.object, authorPosition: position.object } : {}),
      };
    });
}

describe("paperRecordQuery", () => {
  it("selects the paper's triples, with each author's name and position", () => {
    const query = paperRecordQuery(CID);

    expect(query).toContain(`<urn:verisci:paper:${CID}> ?p ?o`);
    expect(query).toContain("?authorName");
    expect(query).toContain("?authorPosition");
  });

  it("refuses to build a query for anything but a canonical CID", () => {
    expect(paperRecordQuery("x> } DROP ALL { <y")).toBeUndefined();
  });
});

describe("parsePaperRecord", () => {
  it("reads back what the Target KA wrote, authors in their order", () => {
    const bindings = bindingsFor(targetKaQuads(METADATA, SUBMISSION)).reverse();

    expect(parsePaperRecord(CID, bindings)).toEqual({
      title: METADATA.title,
      authors: METADATA.authors,
      abstract: METADATA.abstract,
      doi: METADATA.doi,
      pdf: `ipfs://${CID}`,
      submitter: SUBMISSION.submitter,
      signature: SUBMISSION.signature,
      deadline: SUBMISSION.deadline,
    });
  });

  it("leaves out an abstract and a DOI the record does not have", () => {
    const record = parsePaperRecord(
      CID,
      bindingsFor(targetKaQuads({ title: "T", authors: [] }, SUBMISSION)),
    );

    expect(record?.abstract).toBeUndefined();
    expect(record?.doi).toBeUndefined();
    expect(record?.authors).toEqual([]);
  });

  it.each([
    ["no rows", []],
    ["no submitter", [{ p: "http://schema.org/name", o: '"T"' }]],
    [
      "a deadline that is not a number",
      bindingsFor(targetKaQuads({ title: "T", authors: [] }, SUBMISSION)).map((row) =>
        row.p === "urn:verisci:deadline" ? { ...row, o: '"soon"' } : row,
      ),
    ],
  ])("reads %s as no record", (_, bindings) => {
    expect(parsePaperRecord(CID, bindings)).toBeUndefined();
  });
});
