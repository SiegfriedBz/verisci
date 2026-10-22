# @labstrail/core

Domain logic. Core does no IO: no `fetch`, no `node:*` imports and no other
`@labstrail/*` package. IO belongs in an adapter package such as `dkg` or
`contracts`.

`pnpm check` enforces this: `packages/core/biome.json` turns `fetch`,
`node:*` and `@labstrail/*` into errors ("core does no IO").

Its `package.json` declares `"sideEffects": false`: its modules only define functions and
constants, so a bundler drops what a page doesn't use, and a web page that imports one
helper carries none of core's Zod schemas (`apps/web/app/packages.test.ts` keeps the flag).

Status: shared constants, UAL parsing, asset names, a Target KA's content and submission,
the field check both runs make (its prompt and the check of its answer),
reading a paper's record back (`paperRecordQuery`, `parsePaperRecord`), listing published
papers a page at a time (`paperListQuery` and its parsers), OriginTrail's
contracts with the token behind a UAL (`ORIGINTRAIL_CONTRACTS`, `knowledgeAssetToken`), and a
rating's content: a paper's text prepared for the scorer, each study type's checklist, the
scorer's prompt and the check of its answer, the score, the R-KA's triples, and the queries
that find a target's PDF and read a rating back.

Architecture views: [`.omm/overall-architecture/core/`](../../.omm/overall-architecture/core/) (`pnpm exec omm view --port 4000` shows them; root README → Architecture).

## Depends on

The `multiformats` library, to parse CIDs, `@xmldom/xmldom`, to read TEI, Zod, to check the
scorer's and the field check's answers, and no other workspace. pnpm does not hoist undeclared workspace packages,
so an import of another `@labstrail/*` package fails to typecheck.

## API

| Export | What it does |
| --- | --- |
| `coreName` | The package name, imported by the web app's package test |
| `BASE_SEPOLIA_CHAIN_ID` | 84532, the chain id of Base Sepolia, where staging and production run and which UALs reference ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)) |
| `parseUal(input)` | Parses a UAL into a `Ual` (`blockchain`, `chainId`, lowercase `address`, `bigint` `id`), or returns `{ ok: false, reason }` with a `UalError`; never throws |
| `formatUal(ual)` | Writes a `Ual` from `parseUal` as its canonical string |
| `normalizeUal(input)` | The canonical string for any accepted spelling, or the parse failure |
| `isSameUal(a, b)` | True when both are valid UALs naming the same KA |
| `Ual` | A parsed UAL: `blockchain`, `chainId`, lowercase `address`, `bigint` `id` |
| `UalError` | Why a string is not a UAL: `empty`, `not-a-dkg-did`, `bad-chain`, `bad-address`, `bad-id`, `bad-shape` |
| `ParseUalResult`, `NormalizeUalResult` | The results of `parseUal` and `normalizeUal` |
| `rKaName(requestId)` | The R-KA's asset name, `verisci-rka-<request id>`, or `{ ok: false, reason: "bad-request-id" }`; returns a result for every input |
| `canonicalCid(cid)` | A PDF's CID as CIDv1 base32, the spelling a submission signs, or `undefined` for anything an IPFS file upload would not produce; the browser runs it before asking for a signature |
| `targetKaName(cid)` | The Target KA's asset name, `verisci-tka-<CIDv1 base32>`, or `{ ok: false, reason: "bad-cid" }`; returns a result for every input |
| `AssetNameResult`, `AssetNameError` | The result of both, and why an input cannot be named |
| `submissionTypedData(message)` | The EIP-712 typed data a submitter signs to publish a PDF, in the shape viem takes |
| `canonicalContextGraph(id)` | A context graph id with its address in lowercase and its name unchanged: the one spelling a submission signs |
| `SUBMISSION_DOMAIN`, `SubmissionMessage` | LabsTrail's EIP-712 domain, and the signed `{ cid, contextGraph, deadline }` |
| `MAX_PDF_BYTES` | The largest PDF LabsTrail publishes and rates, 15 MB: read by the upload page, the publish run and the rating run |
| `parseTeiHeader(xml)` | A paper's `PaperMetadata` (title, authors, abstract, DOI) from GROBID's TEI header, or `not-tei` or `no-title`; returns a result for every input |
| `PaperMetadata`, `TeiResult` | The metadata read from a TEI header, and the result of `parseTeiHeader` |
| `completeTitle(grobid, stored)` | GROBID's title, or the title the PDF stores in its metadata when that one completes it (below) |
| `fieldCheckPrompt(paper)`, `FieldCheckInput`, `FIELD_OUTPUT_SCHEMA` | The field check, which the publish run makes for a new paper and the rating run before scoring: the system and user text for a paper's title, abstract and opening (an absent abstract or an empty opening leaves out its label), and the JSON Schema its answer must match |
| `parseFieldAnswer(text)` | The field check's answer checked: a known field and a reason that is not empty, cut at a word to 300 characters, or `{ ok: false }` |
| `FIELD_RULE` | The sentence that defines LabsTrail's field ([ADR 0037](../../docs/adr/0037-labstrail-rates-life-science-and-health-papers.md)), in both the field check's and the scorer's prompt |
| `ORIGINTRAIL_CONTRACTS`, `OriginTrailContracts`, `knowledgeAssetToken(ual)` | OriginTrail's `DKGKnowledgeAssets` (the ERC-721 holding every asset's token), `KnowledgeAssetsLifecycle` and TRAC token (which the health check reads publisher wallets' balances of) addresses by chain id, and the contract and token id behind a UAL: the id itself when the UAL names the contract, else the author's address above the asset number in the low 96 bits; `undefined` for a chain with no recorded contracts |
| `paperRecordQuery(cid, contextGraph, ual)`, `parsePaperRecord(cid, bindings)` | The SPARQL that reads a paper's Target KA back from that asset's own graph (named by its UAL; `undefined` when another agent than the graph's minted it), and the `PaperRecord` (title, authors in order, abstract, DOI, PDF link, submitter, signature, deadline) from its rows, or `undefined` when a required field is missing |
| `PaperRecord`, `QueryBinding` | A record read back, and one row of a SPARQL answer |
| `paperListQuery(contextGraph, { limit, offset })`, `parsePaperListing(bindings)` | The SPARQL for one page of a graph's published papers, newest mint first, and the `PaperListing`s (CID, normalized UAL, mint date, title, submitter, signature, deadline, author count) from its rows, each paper once; a row that does not parse is left out. The query is `undefined` for a graph id that is not a full one or whose name holds one of `<>"{}|^` `` ` `` `\`, or a limit or offset that is negative or not a safe integer (limit at least 1) |
| `paperCountQuery(contextGraph)`, `parsePaperCount(bindings)` | The SPARQL counting those papers, with the same patterns, and the total from its row, or `undefined` |
| `paperAuthorsQuery(contextGraph, papers, first)`, `parsePaperAuthors(bindings)` | The SPARQL for the first `first` authors of each listed paper (`{ cid, ual }`), each from its own asset's graph (canonical CIDs and UALs the graph's agent minted only; `undefined` when none is left), and a map from CID to those names in position order |
| `PaperListing` | A listed paper |
| `targetKaQuads(metadata, submission)` | The `Triple`s of a paper's Target KA: its description and who submitted it |
| `Triple`, `PaperSubmission`, `VERISCI_NS` | One triple as the DKG node takes it, the submitter's address, signature and deadline, and the `urn:verisci:` prefix |
| `classifyTarget(targetUal, contextGraph)`, `TargetClass` | How a rating run treats a target: `ours` (canonical, on Base Sepolia, minted by our node), or `invalid` (does not parse, not canonical, another chain, another publisher, or the older UAL form), which is cancelled |
| `publishedPaperQuery(contextGraph, ual)`, `parsePublishedAt(bindings)` | The SPARQL that finds one UAL among the graph's published papers, with the papers list's patterns: one row for a paper our node published, none otherwise (an R-KA included), with its mint time; `undefined` for a UAL that is not canonical or a graph id that is not a full one. The mint time from its row as an ISO date, `undefined` when there is no row or it does not parse |
| `paperPdfQuery(contextGraph, ual)`, `pdfCidOf(bindings)`, `paperHeadOf(bindings)` | The SPARQL reading the `schema:url` of a paper our node minted, with its title and abstract when it has them, from its own graph (`undefined` for another author or a malformed graph id); the canonical CID of the `ipfs://` PDF it links, or `undefined`; and its title (empty when none) and abstract, unquoted, for the rating run's field check |
| `triplesFromBindings(bindings)` | The `Triple`s in the rows of a `SELECT ?s ?p ?o` |
| `preparePaperText(pages, maxChars)`, `PaperText`, `PreparePaperResult` | A paper's text from its PDF's pages, cleaned and fitted to `maxChars` (the reference list left out first, then the end cut, marked `[…]`), or `no-text` for pages holding almost no letters |
| `normalizeForQuote(text)`, `quoteTextOf(text)`, `QuoteText`, `quoteFound(paper, quote)` | The letters and digits a quote is matched on (lowercase, accents and ligatures undone, letters such as `ı` or `ß` folded), a paper's text prepared once for matching, and whether a quote is made of up to three passages of the paper in order, each long enough to show something, with only numbers or whole lines between them; a quote not found whole may leave out whole sentences, each gap marked by an ellipsis (`…`, `...`, `. . .`, bracketed or not), up to two: the part before ends a sentence and the part after starts one, a full stop counting only before a space and a capital or digit and never after an abbreviation (`et al.`, `Fig.`, `no.`) or an initial, so an ellipsis never removes words from inside a sentence the quote keeps |
| `STUDY_TYPES`, `StudyType`, `CHECKS`, `CheckId`, `Check`, `checklistOf(type)` | The eight kinds of study the scorer tells apart, with the checklist each draws on, what each check asks, and a study type's checks in prompt order, each `required` or `conditional` |
| `scorerPrompt(paper)`, `SCORER_OUTPUT_SCHEMA` | The scorer's system and user text for a paper, one request per paper, and the JSON Schema its answer must match |
| `parseScorerAnswer(text)`, `ScorerAnswer`, `FIELDS`, `Field`, `CHECK_ANSWERS`, `CheckAnswer`, `CheckResult` | The scorer's answer checked: the field (`life-sciences` or `outside`), the study type and a reason, and for a paper in the field an answer to every check of its study type (`shown`, `partly`, `missing` or `not-applicable`) with its quote, and a rationale. Checks of another study type are left out, a repeated check keeps its first answer, and a reason, quote or rationale over its limit (500, 300 and 2,000 characters) is cut at a word rather than refused |
| `scoreChecks(paper, answer)`, `checklistScore(studyType, answers)`, `ScorerOutput`, `SCORER_PROMPT_VERSION` | The score code computes from the scorer's answer (`checklistScore` gives the score answers earn, before quotes are checked), with each check as it counted (and what the model claimed for a check it could not count), and the version of the prompt, checklists, scoring and quote matching, `3` |
| `rKaQuads(rating)`, `RatingContent` | The `Triple`s of a rating's R-KA |
| `ratingQuery(contextGraph, rKaUal)`, `parseRating(bindings)`, `RatingRecord` | The SPARQL reading a minted R-KA from its own graph, and the rating from its rows, or `undefined` when its target or phase-1 score is missing or out of range |

## UALs

A UAL names a Knowledge Asset on the DKG: `did:dkg:<blockchain>:<chainId>/<address>/<id>`.
Normalize every UAL with `normalizeUal` before it reaches the contract, a DKG lookup or the
UI ([ADR 0031](../../docs/adr/0031-uals-are-normalized-before-the-contract.md)): the
contract lists ratings under the exact string, so two spellings of one UAL would split its
ratings.

- **Accepted and rewritten:** surrounding whitespace, any case in the `did:dkg:` prefix, the
  blockchain name and the address (`0X` included).
- **Refused:** a chain id or id with a leading zero, a chain id above
  `Number.MAX_SAFE_INTEGER`, an id above 2^256 − 1 (78 digits at most), and any other shape.
- **The oracle cancels** a rating request whose target is not in canonical form, since the
  contract stores the string as given.
- **Both V10 shapes** parse (`docs/domain.md`): `address` is the author's or the
  KnowledgeAssets contract's, which the string cannot tell apart.
- Whether a UAL can be rated (its chain, its node) is the rating workflow's call, not the
  parser's.

## Asset names

Every write to the DKG stores an asset under a name computed from data every process
already has, so a retried store or mint finds the asset an earlier attempt created
([ADR 0007](../../docs/adr/0007-all-writes-converge.md)). Any process recomputes a name
from the request id or the CID.

- **R-KA:** `verisci-rka-<request id>`, the phase-1 request id as `0x` + 64 lowercase hex
  ([ADR 0016](../../docs/adr/0016-asset-names-derive-from-request-id.md)). Any case and
  surrounding whitespace give the same name.
- **Target KA:** `verisci-tka-<CIDv1 base32>`
  ([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)), from the CIDs an IPFS
  upload of a file produces: a sha2-256 digest with the raw or dag-pb codec. Every spelling
  of one CID (`Qm…`, `b…`, `z…`, `k…`) gives the same name; uppercase base32 (`B…`), other
  hashes and other codecs are `bad-cid`. The same bytes uploaded with other import settings
  are another CID, so another name (`docs/domain.md` → IPFS).
- **Scope:** a name holds only its prefix and the request id or CID. The daemon scopes
  names per context graph, so each environment's graph holds its own asset
  (`docs/domain.md` → DKG).
- Every name is lowercase `[a-z0-9-]`, 78 characters for an R-KA and 71 for a Target KA,
  within the daemon's 1 to 256 and with no `:`, so the daemon reads it as a name.

## Target KAs

A Target KA describes a paper and who submitted it
([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)).

- **Metadata** comes from GROBID's TEI header, read by `parseTeiHeader`: the main title,
  each author's forenames and surname in document order, the abstract's paragraphs and the
  DOI, each with its whitespace collapsed. In authors' names (in Unicode NFC), an accent
  GROBID gives apart from its letter is joined back in the shapes GROBID gives: after a space
  or a dotless `ı`, to the letter before it (`Bele ´n` → `Belén`, `Rodrı ´guez` →
  `Rodríguez`); an acute, grave, diaeresis or circumflex before a dotless `ı`, to the `ı`
  (`Garc ´ıa` → `García`). It joins only when the two make one letter of Latin-1 Supplement to
  Latin Extended-B (`é`, `ü`, `ç`, `ř`, `ő`), so a Vietnamese `ễ` stays split. An accent that
  opens a surname before a lowercase letter goes to the forename's last letter, unless the
  forename ends in an initial or its letter cannot take it; one before a dotless `ı` is left to
  the `ı`. An accent right after a letter or before
  a capital is an apostrophe and stays (`N´diaye`, `O´Brien`). The title and the abstract stay
  as GROBID gives them: papers also write `´` as an apostrophe or a prime (`Alzheimer´s`,
  `3´ UTR`). A header with no title is refused, and so is XML with any parse error
  (`not-tei`), without printing anything.
- **The title** is GROBID's, completed by `completeTitle` from the title the PDF stores in its
  own metadata, since GROBID's header model can drop a title's first words (`docs/domain.md` →
  GROBID): the stored title, its whitespace collapsed, replaces GROBID's only when it is
  longer, at most 300 characters, and ends with GROBID's title at a word's start, ignoring
  case, whitespace and a final full stop. Words before it holding a spaced dash or a bar, or
  ending in an en or em dash (`Cell Genomics - <title>`, `Cell Genomics—<title>`), are a
  journal's or a site's name and leave GROBID's, cut or whole, as does a file name, a
  journal's name or another paper's title stored on its own; a colon, a full stop or a dash
  between two words still completes it (`Neuroprotection: <title>`, `E. coli …`,
  `Dose–response …`, `Long-term …`).
- **Triples:** the subject is `urn:verisci:paper:<cid>`, typed `schema:ScholarlyArticle`,
  with `schema:name`, `schema:url` (`ipfs://<cid>`), `schema:abstract`, `schema:sameAs`
  (`https://doi.org/<doi>`), and one `schema:author` node per author,
  `urn:verisci:paper:<cid>/author/<n>`, with `schema:name` and `schema:position`.
  `schema:abstract` and `schema:sameAs` are written only when an abstract or a DOI was
  read; the DOI is lowercase, with any `doi:` or `https://doi.org/` prefix removed.
  `schema:position` and `urn:verisci:deadline` are `xsd:integer` literals
  (`"7"^^<http://www.w3.org/2001/XMLSchema#integer>`).
- **Submission:** `urn:verisci:submitter` (the lowercase address), `urn:verisci:signature`
  and `urn:verisci:deadline` record the EIP-712 signature over
  `Submission { string cid; string contextGraph; uint256 deadline }`, under the domain
  `{ name: "labstrail", version: "1", chainId: 84532 }`.
- **Checking who submitted a paper:** take the CID from `schema:url`, the context graph id
  the KA is in, and the deadline; rebuild the typed data with `submissionTypedData`, which
  writes the graph id's address in lowercase (`canonicalContextGraph`), the spelling every
  submission signs; and
  verify the signature against the submitter's address with any EIP-712 library (viem's
  `verifyTypedData` also checks smart-contract wallets).
- **Listing published papers:** `paperListQuery` reads the graph's `_meta` graph, where the
  node records each minted asset (`dkg:memoryLayer "VM"`), its UAL and the mint's date
  (`dkg:publishedAt`). It keeps only the Target KAs our node named and minted: the asset's
  path is `assertion/<graph's agent>/verisci-tka-…` and its UAL's address is that agent, so
  an asset another node adds to an open graph is never listed. It reads each paper's
  triples from that asset's own graph, `_verifiable_memory/<agent>/<number>`, so another
  asset's triples about the same paper never mix into a row (`docs/domain.md` → DKG).
  `paperRecordQuery` and `paperAuthorsQuery` read from the same per-asset graph. The list
  orders by the mint's date, newest first, then by paper, so pages are stable between two
  reads with no new mint.

- **The field check:** before a new paper is stored, the publish run asks a small model
  whether it is in LabsTrail's field, and the rating run asks it again before scoring ([ADR 0037](../../docs/adr/0037-labstrail-rates-life-science-and-health-papers.md)).
  `fieldCheckPrompt` defines the field with `FIELD_RULE`, the same sentence the scorer's
  prompt uses, tells the model the paper's text is data, never instructions, and gives it the
  title, the abstract and the opening of the text, each under its label. The answer is
  `{ field, reason }`: `life-sciences` or `outside`, and one sentence on what the paper
  studies.

## Ratings

A rating is its own Knowledge Asset, the R-KA, linked to the KA it rates
([ADR 0011](../../docs/adr/0011-a-rating-is-a-separate-r-ka.md)) and named from its phase-1
request id (Asset names above).

- **Targets:** only papers LabsTrail published, in its field, are rated
  ([ADR 0011](../../docs/adr/0011-a-rating-is-a-separate-r-ka.md),
  [ADR 0037](../../docs/adr/0037-labstrail-rates-life-science-and-health-papers.md)).
  `classifyTarget` decides what a rating run does with a request's target UAL: one that does
  not parse, is not in the canonical spelling `normalizeUal` writes
  ([ADR 0031](../../docs/adr/0031-uals-are-normalized-before-the-contract.md)), names another
  chain than Base Sepolia or another publisher is cancelled by the oracle, and
  `publishedPaperQuery` checks that one of ours is a published paper, not an R-KA.
  `paperPdfQuery` and `pdfCidOf` then find the PDF it links.
- **The paper's text:** `preparePaperText` takes the text of each of the PDF's pages: it trims
  each line, drops lines holding only a number (line and page numbers) and, in a line-numbered
  manuscript (eight lines in a row ending in numbers that count up, as Word and LaTeX's lineno
  glue them: "Methods66"), the number at each line's end, joins a lowercase word hyphenated
  across a line break, and collapses runs of spaces and blank lines. A text over
  the cap loses its reference list first, from a "References" heading to the next statement or
  methods heading, then is cut at a word boundary.
- **The scorer's request:** `scorerPrompt` asks the model, in one request, for the paper's
  field, `life-sciences` or `outside`, and its study type: `randomized-trial`,
  `observational`, `animal`, `lab`, `systematic-review`, `narrative-review`, `computational`
  or `other`. For a paper in the field, it then answers each check of that study type
  (`checklistOf`): the type's own, drawn from CONSORT 2025, STROBE, ARRIVE 2.0, MDAR,
  PRISMA 2020, SANRA or DOME and worded in our own words, then data and code availability,
  funding, competing interests, ethics and limitations. Each answer is `shown`, `partly`,
  `missing`, or `not-applicable` for a check marked as one that may not apply, with the
  passage that shows it; a statement that a check does not apply counts as `shown`. The
  paper is untrusted text, so the prompt tells the model to treat it as data.
- **The score:** `scoreChecks` computes it
  ([ADR 0018](../../docs/adr/0018-phase-1-scorer-output-contract.md)): `shown` earns 1 point,
  `partly` half, `missing` none, and the score is `round(100 × points / applicable checks)`,
  rounding half up. A conditional check that does not apply leaves the count; a required one
  counts as `missing`. A `shown` or `partly` answer whose quote `quoteFound` does not find in
  the paper counts as `missing`, so every point rests on the paper's own words. A quote may
  run across what a PDF prints inside a statement (a page header, reference numbers, the box
  beside a first page, up to about a page of it), but never leave out a word: "the assessors
  were blinded" is not found in a paper that says "were not blinded". An ellipsis in a quote
  may stand only for whole sentences left out, so it never removes words from inside a
  sentence the quote keeps; a quote may still start or end inside a sentence (version 3).
  Such a check keeps what the model claimed (`claimed`), so the record tells "the paper does
  not say it" from "the model quoted something the paper does not hold". The way the
  expectations depend on the kind of study, and the credit for a statement that a check does
  not apply, follow the Rigor and Transparency Index (Menke et al., iScience 2020; JMIR 2022).
- **Triples:** the subject is `urn:verisci:rating:<request id>`, typed `schema:Review`, with
  `schema:about` (the target's UAL), `urn:verisci:requestId`, `urn:verisci:contract`
  (`eip155:<chain id>:<address>`) and `schema:reviewRating` pointing at the phase-1 node,
  `urn:verisci:rating:<request id>/phase/1`. That node is a `schema:Rating` with
  `urn:verisci:phase` 1, `schema:ratingValue`, `schema:worstRating` 0 and
  `schema:bestRating` 100 (`xsd:integer` literals), the rationale as
  `schema:ratingExplanation`, `urn:verisci:studyType`, `urn:verisci:model`,
  `urn:verisci:promptVersion` and `urn:verisci:textShortened` (`xsd:boolean`: the paper's text
  was cut to fit), and one `urn:verisci:check` per check, pointing at `…/phase/1/check/<id>`,
  which holds `urn:verisci:checkId`, `urn:verisci:answer`, and when they apply
  `urn:verisci:quote`, `urn:verisci:claimedAnswer` and `urn:verisci:claimedQuote`. Later phases add their own `…/phase/<n>` node to the same R-KA
  ([ADR 0012](../../docs/adr/0012-three-phases-settled-by-the-oracle.md)).
- **The version:** `SCORER_PROMPT_VERSION` names the prompt, the checklists, the scoring, quote
  matching and the paper's text preparation together, and every R-KA records it with the model.
  A test fingerprints the prompt (system and user), the scores of fixed answers, which of fixed
  quotes are found and the text two real papers' pages give, so a change that alters any of
  them fails until the version is raised; a version merged into `develop` is never changed
  again.
- **Reading back:** `ratingQuery` and `parseRating` read the score from the minted R-KA, so
  the score the oracle records always equals the score in the R-KA. An R-KA from the first
  scorer, which judged eight signals over the paper's record (`urn:verisci:observed` and
  `urn:verisci:missing`), reads back with its score, no study type and no checks.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @labstrail/core typecheck` | Typechecks the package |
| `pnpm --filter @labstrail/core test` | Runs its Vitest project (`vitest run`) |

Ships TypeScript source (`src/index.ts`), with no build step. The source is grouped by
feature: `src/assets/`, `src/publish/`, `src/papers/` and `src/rating/` (`CLAUDE.md` here).
