import { describe, expect, it } from "vitest";
import { readPaper } from "./read-paper.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const PDF = new TextEncoder().encode("%PDF-1.5\n");
const TEI = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc>
  <titleStmt><title>A Title</title></titleStmt></fileDesc></teiHeader></TEI>`;

/** Answers the gateway with `pdf` and GROBID with `grobid`, by URL. */
function fakeFetch(pdf: () => Response, grobid: () => Response) {
  return (async (input: string | URL | Request) =>
    String(input).includes("/ipfs/") ? pdf() : grobid()) as typeof fetch;
}

function read(fetch: typeof globalThis.fetch) {
  return readPaper(CID, {
    gatewayUrl: "https://example.mypinata.cloud",
    grobidUrl: "http://127.0.0.1:8070",
    fetch,
    maxBytes: 1000,
    timeoutMs: 1000,
  });
}

describe("readPaper", () => {
  it("fetches the PDF, parses its header and returns its metadata", async () => {
    const fetch = fakeFetch(
      () => new Response(PDF),
      () => new Response(TEI),
    );

    expect(await read(fetch)).toEqual({ ok: true, metadata: { title: "A Title", authors: [] } });
  });

  it("passes on why the PDF could not be fetched", async () => {
    const fetch = fakeFetch(
      () => new Response("<html/>"),
      () => new Response(TEI),
    );

    expect(await read(fetch)).toEqual({ ok: false, reason: "not-a-pdf" });
  });

  it("passes on why GROBID could not parse it", async () => {
    const fetch = fakeFetch(
      () => new Response(PDF),
      () => new Response("busy", { status: 503 }),
    );

    expect(await read(fetch)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports a header with no title as no-title", async () => {
    const fetch = fakeFetch(
      () => new Response(PDF),
      () => new Response(TEI.replace("A Title", "")),
    );

    expect(await read(fetch)).toEqual({ ok: false, reason: "no-title" });
  });

  it("reports an answer that is not TEI as unparseable", async () => {
    const fetch = fakeFetch(
      () => new Response(PDF),
      () => new Response("<html/>"),
    );

    expect(await read(fetch)).toEqual({ ok: false, reason: "unparseable" });
  });
});
