import { assetGraphIri } from "../assets/asset-graph.ts";
import { BASE_SEPOLIA_CHAIN_ID } from "../assets/chains.ts";
import { canonicalCid } from "../assets/cid.ts";
import { normalizeUal, parseUal } from "../assets/ual.ts";
import { type QueryBinding, unquote } from "../papers/paper-record.ts";
import { integer, literal, type Triple, VERISCI_NS } from "../publish/target-ka.ts";
import { checklistOf, STUDY_TYPES, type StudyType } from "./checklists.ts";
import { CHECK_ANSWERS, type CheckResult, type ScorerOutput } from "./scorer.ts";

/** How a rating run treats a target UAL: `ours` is rated, `invalid` is cancelled. */
export type TargetClass = "ours" | "invalid";

/** What {@link rKaQuads} writes into a rating's R-KA. */
export interface RatingContent {
  /** The phase-1 request id, `0x` + 64 lowercase hex. */
  readonly requestId: string;
  /** The canonical UAL of the rated KA. */
  readonly targetUal: string;
  /** The contract that took the request, as `eip155:<chain id>:<lowercase address>`. */
  readonly contract: string;
  readonly output: ScorerOutput;
  /** The model that scored, as its provider reports it. */
  readonly model: string;
  readonly promptVersion: string;
  /** True when the paper's text was shortened to fit the scorer (`preparePaperText`). */
  readonly textShortened: boolean;
}

/** A rating read back from its R-KA by {@link parseRating}. */
export interface RatingRecord {
  readonly requestId: string;
  readonly targetUal: string;
  readonly score: number;
  readonly rationale: string;
  /** Absent for a rating the v1 scorer made, which judged no study type. */
  readonly studyType?: StudyType;
  /** The study type's checks the R-KA holds, in checklist order; none for a v1 rating. */
  readonly checks: readonly CheckResult[];
  readonly model: string;
  readonly promptVersion: string;
  /** Whether the paper's text was shortened to fit; absent for a v1 rating. */
  readonly textShortened?: boolean;
}

const SCHEMA = "http://schema.org/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const MAX_SCORE = 100;
const XSD_BOOLEAN = "http://www.w3.org/2001/XMLSchema#boolean";
const STUDY_TYPE_IDS: ReadonlySet<string> = new Set(STUDY_TYPES.map((type) => type.id));
const ANSWERS: ReadonlySet<string> = new Set(CHECK_ANSWERS);

/**
 * How a rating run treats `targetUal` (ADRs 0011, 0031): `ours` when it is in canonical form,
 * on Base Sepolia (the DKG's chain), and minted by our node, the agent of `contextGraph`, so
 * LabsTrail published it; `invalid` otherwise: it does not parse, is not canonical, names
 * another chain or another publisher, or is the older form that names the KnowledgeAssets
 * contract. Only papers LabsTrail published are rated.
 */
export function classifyTarget(targetUal: string, contextGraph: string): TargetClass {
  const parsed = parseUal(targetUal);
  const normalized = normalizeUal(targetUal);
  if (!parsed.ok || !normalized.ok || normalized.ual !== targetUal) return "invalid";
  if (parsed.ual.blockchain !== "base" || parsed.ual.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    return "invalid";
  }
  const agent = contextGraph.slice(0, contextGraph.indexOf("/")).toLowerCase();
  return parsed.ual.address === agent ? "ours" : "invalid";
}

/**
 * The SPARQL that reads the `schema:url` of a paper our node minted, from the asset's own
 * graph: the `ipfs://` link to its PDF (ADR 0010), for {@link pdfCidOf}, with its title and
 * abstract when it has them, for {@link paperHeadOf}. `undefined` for a UAL another agent minted
 * or a malformed graph id.
 */
export function paperPdfQuery(contextGraph: string, ual: string): string | undefined {
  const graph = assetGraphIri(contextGraph, ual);
  return (
    graph &&
    `SELECT ?url ?title ?abstract WHERE {\n  GRAPH <${graph}> {\n    ?paper <${SCHEMA}url> ?url .\n    OPTIONAL { ?paper <${SCHEMA}name> ?title }\n    OPTIONAL { ?paper <${SCHEMA}abstract> ?abstract }\n  }\n}`
  );
}

/**
 * A paper's title and abstract, unquoted, from the rows of {@link paperPdfQuery}, for the
 * rating run's field check (ADR 0037): an empty title when no row holds one, and no abstract
 * when the paper has none.
 */
export function paperHeadOf(bindings: readonly QueryBinding[]): {
  readonly title: string;
  readonly abstract?: string;
} {
  const row = bindings.find((binding) => binding.title !== undefined) ?? bindings[0];
  const title = row?.title === undefined ? "" : unquote(row.title);
  return row?.abstract === undefined ? { title } : { title, abstract: unquote(row.abstract) };
}

/**
 * The CID of the PDF a paper links, from the rows of {@link paperPdfQuery}, in its canonical
 * spelling, or `undefined` when no row holds an `ipfs://` IRI with a valid CID.
 */
export function pdfCidOf(bindings: readonly QueryBinding[]): string | undefined {
  for (const { url } of bindings) {
    const cid = url?.startsWith("ipfs://") ? canonicalCid(url.slice("ipfs://".length)) : undefined;
    if (cid) return cid;
  }
  return undefined;
}

/**
 * The SPARQL that reads a rating's R-KA, minted as `rKaUal`, from its own graph, for
 * {@link parseRating}. `undefined` for an R-KA another agent minted or a malformed graph id.
 */
export function ratingQuery(contextGraph: string, rKaUal: string): string | undefined {
  return assetTriplesQuery(contextGraph, rKaUal);
}

function assetTriplesQuery(contextGraph: string, ual: string): string | undefined {
  const graph = assetGraphIri(contextGraph, ual);
  return graph && `SELECT ?s ?p ?o WHERE {\n  GRAPH <${graph}> { ?s ?p ?o }\n}`;
}

/** The triples in the rows of a `SELECT ?s ?p ?o`; a row missing a term is left out. */
export function triplesFromBindings(bindings: readonly QueryBinding[]): Triple[] {
  return bindings.flatMap(({ s, p, o }) =>
    s && p && o ? [{ subject: s, predicate: p, object: o }] : [],
  );
}

/**
 * The triples of a rating's R-KA (ADRs 0011, 0012, 0018): a `schema:Review` of its target
 * (`schema:about`), with the request id and contract, and a `schema:Rating` node for phase 1
 * holding the score, its range, the rationale, the study type, the model, the prompt version and
 * whether the paper's text was shortened, and linking one node per check
 * (`…/phase/1/check/<id>`) with its id, its answer, its quote when it has one, and what the model
 * claimed when the score could not count it. Later phases add their own `…/phase/<n>` node to
 * the same R-KA.
 *
 * The same input always gives the same triples in the same order.
 */
export function rKaQuads(rating: RatingContent): Triple[] {
  const review = ratingIri(rating.requestId);
  const phase = `${review}/phase/1`;
  const { output } = rating;
  return [
    { subject: review, predicate: RDF_TYPE, object: `${SCHEMA}Review` },
    { subject: review, predicate: `${SCHEMA}about`, object: rating.targetUal },
    { subject: review, predicate: `${VERISCI_NS}requestId`, object: literal(rating.requestId) },
    { subject: review, predicate: `${VERISCI_NS}contract`, object: literal(rating.contract) },
    { subject: review, predicate: `${SCHEMA}reviewRating`, object: phase },
    { subject: phase, predicate: RDF_TYPE, object: `${SCHEMA}Rating` },
    { subject: phase, predicate: `${VERISCI_NS}phase`, object: integer(1) },
    { subject: phase, predicate: `${SCHEMA}ratingValue`, object: integer(output.score) },
    { subject: phase, predicate: `${SCHEMA}worstRating`, object: integer(0) },
    { subject: phase, predicate: `${SCHEMA}bestRating`, object: integer(MAX_SCORE) },
    { subject: phase, predicate: `${SCHEMA}ratingExplanation`, object: literal(output.rationale) },
    { subject: phase, predicate: `${VERISCI_NS}studyType`, object: literal(output.studyType) },
    { subject: phase, predicate: `${VERISCI_NS}model`, object: literal(rating.model) },
    {
      subject: phase,
      predicate: `${VERISCI_NS}promptVersion`,
      object: literal(rating.promptVersion),
    },
    {
      subject: phase,
      predicate: `${VERISCI_NS}textShortened`,
      object: `"${rating.textShortened}"^^<${XSD_BOOLEAN}>`,
    },
    ...output.checks.flatMap(({ id, answer, quote, claimed }) => {
      const check = `${phase}/check/${id}`;
      const optional = (predicate: string, value: string | undefined): Triple[] =>
        value === undefined
          ? []
          : [{ subject: check, predicate: `${VERISCI_NS}${predicate}`, object: literal(value) }];
      return [
        { subject: phase, predicate: `${VERISCI_NS}check`, object: check },
        { subject: check, predicate: `${VERISCI_NS}checkId`, object: literal(id) },
        { subject: check, predicate: `${VERISCI_NS}answer`, object: literal(answer) },
        ...optional("quote", quote),
        ...optional("claimedAnswer", claimed?.answer),
        ...optional("claimedQuote", claimed?.quote),
      ];
    }),
  ];
}

function ratingIri(requestId: string): string {
  return `${VERISCI_NS}rating:${requestId}`;
}

/**
 * A rating from the rows of {@link ratingQuery}, or `undefined` when its review, target or
 * phase-1 score is missing, or the score is not an integer from 0 to 100. The checks come in
 * the study type's checklist order; a check with an unknown id or answer, or none of the study
 * type's, is left out, as is a claimed answer that is not one of the answers. A v1 R-KA, or one
 * with an unknown study type, gives no study type and no checks; a v1 R-KA says nothing about
 * its text being shortened. Pure: reads only the rows.
 */
export function parseRating(bindings: readonly QueryBinding[]): RatingRecord | undefined {
  const triples = triplesFromBindings(bindings);
  const objects = (subject: string, predicate: string) =>
    triples
      .filter((triple) => triple.subject === subject && triple.predicate === predicate)
      .map((triple) => triple.object);
  const text = (subject: string, predicate: string) => {
    const [first] = objects(subject, predicate);
    return first === undefined ? undefined : unquote(first);
  };

  const review = triples.find(
    (triple) => triple.predicate === RDF_TYPE && triple.object === `${SCHEMA}Review`,
  )?.subject;
  if (!review) return undefined;
  const phase = `${review}/phase/1`;
  const targetUal = objects(review, `${SCHEMA}about`)[0];
  const score = text(phase, `${SCHEMA}ratingValue`);
  if (!targetUal || score === undefined || !/^\d{1,3}$/.test(score)) return undefined;
  if (Number(score) > MAX_SCORE) return undefined;

  const type = text(phase, `${VERISCI_NS}studyType`);
  const studyType =
    type !== undefined && STUDY_TYPE_IDS.has(type) ? (type as StudyType) : undefined;
  const checks = studyType ? readChecks(phase, studyType, objects, text) : [];
  const shortened = text(phase, `${VERISCI_NS}textShortened`);
  return {
    requestId: text(review, `${VERISCI_NS}requestId`) ?? "",
    targetUal,
    score: Number(score),
    rationale: text(phase, `${SCHEMA}ratingExplanation`) ?? "",
    ...(studyType ? { studyType } : {}),
    checks,
    model: text(phase, `${VERISCI_NS}model`) ?? "",
    promptVersion: text(phase, `${VERISCI_NS}promptVersion`) ?? "",
    ...(shortened === "true" || shortened === "false"
      ? { textShortened: shortened === "true" }
      : {}),
  };
}

/** The phase node's checks that belong to `studyType`'s checklist, in its order. */
function readChecks(
  phase: string,
  studyType: StudyType,
  objects: (subject: string, predicate: string) => string[],
  text: (subject: string, predicate: string) => string | undefined,
): CheckResult[] {
  const found = new Map<string, CheckResult>();
  for (const node of objects(phase, `${VERISCI_NS}check`)) {
    const id = text(node, `${VERISCI_NS}checkId`);
    const answer = text(node, `${VERISCI_NS}answer`);
    if (id === undefined || answer === undefined || !ANSWERS.has(answer)) continue;
    const quote = text(node, `${VERISCI_NS}quote`);
    const claimedAnswer = text(node, `${VERISCI_NS}claimedAnswer`);
    const claimedQuote = text(node, `${VERISCI_NS}claimedQuote`);
    const claimed =
      claimedAnswer !== undefined && ANSWERS.has(claimedAnswer)
        ? {
            answer: claimedAnswer as CheckResult["answer"],
            ...(claimedQuote === undefined ? {} : { quote: claimedQuote }),
          }
        : undefined;
    found.set(id, {
      id: id as CheckResult["id"],
      answer: answer as CheckResult["answer"],
      ...(quote === undefined ? {} : { quote }),
      ...(claimed ? { claimed } : {}),
    });
  }
  return checklistOf(studyType).flatMap((check) => {
    const result = found.get(check.id);
    return result ? [result] : [];
  });
}
