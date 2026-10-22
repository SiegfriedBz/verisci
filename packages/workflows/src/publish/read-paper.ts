import { completeTitle, parseTeiHeader } from "@labstrail/core";
import { type FetchPdfOptions, fetchPdf } from "../pdf/fetch-pdf.ts";
import { paperTextOf } from "../pdf/paper-text.ts";
import { type GrobidOptions, parseHeader } from "./grobid.ts";
import type { ReadPaperResult } from "./publish-paper.ts";

/** Where {@link readPaper} reads a PDF and parses it, and how much of its text it keeps. */
export type ReadPaperOptions = FetchPdfOptions &
  GrobidOptions & {
    /** The longest opening kept for the field check (`PUBLISH_SETTINGS.openingChars`). */
    readonly openingChars: number;
  };

/**
 * Fetches a pinned PDF by its CID, has GROBID parse its header and reads the metadata from
 * the TEI, then reads the opening of its text with the rating's reader (`paperTextOf`), so the
 * PDF's bytes stay inside one step (ADR 0010). The title is GROBID's, completed from the title
 * the PDF stores when GROBID dropped its first words (`completeTitle`); the authors, abstract
 * and DOI are GROBID's. A TEI that cannot be read is `unparseable`; a
 * PDF the rating's reader cannot parse is `unreadable`, and one with no text layer `no-text`,
 * so every paper published can be rated.
 */
export async function readPaper(cid: string, options: ReadPaperOptions): Promise<ReadPaperResult> {
  const pdf = await fetchPdf(cid, options);
  if (!pdf.ok) return pdf;
  // unpdf takes over the bytes it reads, so it gets a copy and GROBID the original.
  const copy = pdf.bytes.slice();
  const header = await parseHeader(pdf.bytes, options);
  if (!header.ok) return header;
  const tei = parseTeiHeader(header.tei);
  if (!tei.ok) return { ok: false, reason: tei.reason === "not-tei" ? "unparseable" : tei.reason };
  const text = await paperTextOf(copy, options.openingChars);
  if (!text.ok) return { ok: false, reason: text.reason === "no-text" ? "no-text" : "unreadable" };
  const title = completeTitle(tei.metadata.title, text.storedTitle);
  return { ok: true, metadata: { ...tei.metadata, title }, opening: text.paper.text };
}
