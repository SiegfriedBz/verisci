import { parseTeiHeader } from "@verisci/core";
import { type FetchPdfOptions, fetchPdf } from "./fetch-pdf.ts";
import { type GrobidOptions, parseHeader } from "./grobid.ts";
import type { ReadPaperResult } from "./publish-paper.ts";

/** Where {@link readPaper} reads a PDF and parses it. */
export type ReadPaperOptions = FetchPdfOptions & GrobidOptions;

/**
 * Fetches a pinned PDF by its CID, has GROBID parse its header and reads the metadata from
 * the TEI, so the PDF's bytes stay inside one step (ADR 0010). A TEI that cannot be read is
 * `unparseable`.
 */
export async function readPaper(cid: string, options: ReadPaperOptions): Promise<ReadPaperResult> {
  const pdf = await fetchPdf(cid, options);
  if (!pdf.ok) return pdf;
  const header = await parseHeader(pdf.bytes, options);
  if (!header.ok) return header;
  const tei = parseTeiHeader(header.tei);
  if (!tei.ok) return { ok: false, reason: tei.reason === "not-tei" ? "unparseable" : tei.reason };
  return { ok: true, metadata: tei.metadata };
}
