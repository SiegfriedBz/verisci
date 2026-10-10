import { DOMParser, type Element } from "@xmldom/xmldom";

/** A paper's header metadata, as read from GROBID's TEI. */
export interface PaperMetadata {
  readonly title: string;
  /** Each author's full name, in document order. */
  readonly authors: readonly string[];
  readonly abstract?: string;
  /** Lowercase, with no `https://doi.org/` or `doi:` prefix; absent when what GROBID read is not a DOI. */
  readonly doi?: string;
}

/** The result of {@link parseTeiHeader}. */
export type TeiResult =
  | { readonly ok: true; readonly metadata: PaperMetadata }
  | { readonly ok: false; readonly reason: "not-tei" | "no-title" };

const TEI_NS = "http://www.tei-c.org/ns/1.0";
const DOI_PREFIX = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)/i;
/** A DOI (`10.<registrant>/<suffix>`) with no character that would break the IRI it goes into. */
const DOI = /^10\.\d{4,9}\/[^\s<>"{}|\\^`]+$/;

/** True for a lowercase DOI that can be written into an IRI as is. */
export function isDoi(value: string): boolean {
  return DOI.test(value);
}

/**
 * Reads a paper's title, authors, abstract and DOI from GROBID's TEI header
 * (`processHeaderDocument`). Whitespace inside each field collapses to single spaces.
 *
 * Returns `not-tei` for input that is not a TEI document with a header, and `no-title` for
 * a header with no title. Returns a result for every input.
 */
export function parseTeiHeader(xml: string): TeiResult {
  const header = teiHeader(xml);
  if (!header) return { ok: false, reason: "not-tei" };

  const titleStmt = first(header, "titleStmt");
  const title = text(titleStmt && first(titleStmt, "title"));
  if (!title) return { ok: false, reason: "no-title" };

  const analytic = first(header, "analytic");
  const authors = (analytic ? all(analytic, "author") : [])
    .map((author) => {
      const name = first(author, "persName");
      return name ? all(name, "forename").concat(all(name, "surname")).map(text).join(" ") : "";
    })
    .map(collapse)
    .filter((name) => name !== "");

  const abstractElement = first(header, "abstract");
  const abstract = abstractElement ? collapse(all(abstractElement, "p").map(text).join(" ")) : "";

  const doiElement = all(header, "idno").find(
    (idno) => idno.getAttribute("type")?.toUpperCase() === "DOI",
  );
  const read = text(doiElement).replace(DOI_PREFIX, "").toLowerCase();
  const doi = isDoi(read) ? read : "";

  return {
    ok: true,
    metadata: {
      title,
      authors,
      ...(abstract ? { abstract } : {}),
      ...(doi ? { doi } : {}),
    },
  };
}

function teiHeader(xml: string): Element | undefined {
  try {
    // Stop on any error, silently: core prints nothing, and a broken answer is not-tei.
    const parser = new DOMParser({
      onError: (level) => {
        if (level !== "warning") throw new Error("not-tei");
      },
    });
    const document = parser.parseFromString(xml, "text/xml");
    return first(document.documentElement, "teiHeader");
  } catch {
    return undefined;
  }
}

function all(parent: Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS(TEI_NS, localName));
}

function first(parent: Element | null | undefined, localName: string): Element | undefined {
  return parent ? all(parent, localName)[0] : undefined;
}

function text(element: Element | undefined): string {
  return collapse(element?.textContent ?? "");
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
