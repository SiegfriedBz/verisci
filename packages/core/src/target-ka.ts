import type { PaperMetadata } from "./tei.ts";

/** One triple, as the DKG node takes it: IRIs bare, literals quoted (`"\"7\""`). */
export interface Triple {
  readonly subject: string;
  readonly predicate: string;
  readonly object: string;
}

/** Who submitted a paper, and the EIP-712 signature that proves it (ADR 0010). */
export interface PaperSubmission {
  /** The PDF's CID, canonical CIDv1 base32. */
  readonly cid: string;
  readonly submitter: string;
  readonly signature: string;
  /** The signed deadline, in Unix seconds. */
  readonly deadline: bigint;
}

/** The prefix of verisci's own predicates and subjects. */
export const VERISCI_NS = "urn:verisci:";

const SCHEMA = "http://schema.org/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const XSD_INTEGER = "http://www.w3.org/2001/XMLSchema#integer";

/**
 * The triples of a paper's Target KA: its schema.org description (title, `ipfs://` link,
 * abstract, DOI, authors with their position) and its submission (submitter's lowercase
 * address, signature and deadline under `urn:verisci:` predicates), so anyone can rebuild
 * the signed message from the KA and verify it. Fields that are absent produce no triple.
 *
 * The same input always gives the same triples in the same order.
 */
export function targetKaQuads(metadata: PaperMetadata, submission: PaperSubmission): Triple[] {
  const paper = `${VERISCI_NS}paper:${submission.cid}`;
  const triples: Triple[] = [
    { subject: paper, predicate: RDF_TYPE, object: `${SCHEMA}ScholarlyArticle` },
    { subject: paper, predicate: `${SCHEMA}name`, object: literal(metadata.title) },
    { subject: paper, predicate: `${SCHEMA}url`, object: `ipfs://${submission.cid}` },
  ];
  if (metadata.abstract) {
    triples.push({
      subject: paper,
      predicate: `${SCHEMA}abstract`,
      object: literal(metadata.abstract),
    });
  }
  if (metadata.doi) {
    triples.push({
      subject: paper,
      predicate: `${SCHEMA}sameAs`,
      object: `https://doi.org/${metadata.doi}`,
    });
  }
  metadata.authors.forEach((name, index) => {
    const author = `${paper}/author/${index + 1}`;
    triples.push(
      { subject: paper, predicate: `${SCHEMA}author`, object: author },
      { subject: author, predicate: `${SCHEMA}name`, object: literal(name) },
      { subject: author, predicate: `${SCHEMA}position`, object: integer(index + 1) },
    );
  });
  triples.push(
    {
      subject: paper,
      predicate: `${VERISCI_NS}submitter`,
      object: literal(submission.submitter.toLowerCase()),
    },
    { subject: paper, predicate: `${VERISCI_NS}signature`, object: literal(submission.signature) },
    { subject: paper, predicate: `${VERISCI_NS}deadline`, object: integer(submission.deadline) },
  );
  return triples;
}

function literal(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
  return `"${escaped}"`;
}

function integer(value: number | bigint): string {
  return `"${value}"^^<${XSD_INTEGER}>`;
}
