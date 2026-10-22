# 0010. PDFs become Target KAs in a stepped pipeline

- Status: Accepted
- Date: 2026-10-02

## Context

Papers enter LabsTrail as PDFs and must become Target KAs. Parsing and the DKG write are each slow and each fail in their own way. A PDF can exceed Vercel's request body limit, and Inngest caps event and step sizes ([domain](../domain.md)). Our node mints every Target KA, so on chain the publisher is always our node: who submitted a paper must be recorded some other way, and provably.

## Decision

- The browser uploads the PDF straight to IPFS pinning with a short-lived signed URL from the server, so the file never passes through a Vercel function. The server checks the pinned file before starting the pipeline. A file that fails the check is unpinned only if it is not a PDF and no asset points at it: every environment shares one pinning account, and their size limits may differ ([0005](0005-staging-and-production-are-isolated.md)).
- The submitter signs an EIP-712 statement of the PDF's CID with their wallet. The server verifies it before publishing, and the Target KA records the submitter's address and signature, so anyone can check who submitted it without trusting LabsTrail. The signed statement's domain is named `labstrail`; papers published before the rename ([0042](0042-the-project-is-named-labstrail.md)) were signed under `verisci`, and their signatures check under that name. No contract call: a published paper can be rated without being registered on chain, and only papers LabsTrail published are rated ([0011](0011-a-rating-is-a-separate-r-ka.md)).
- Events and step outputs carry the PDF's CID, never its bytes.
- The pipeline runs each stage as its own step: parse with GROBID, check the field, store, then mint ([0007](0007-all-writes-converge.md), [0008](0008-mints-are-async-polled-in-short-steps.md)). The metadata is read by code from GROBID's structured output, its title completed from the title the PDF stores in its own metadata when GROBID dropped its first words, so the same PDF always gives the same KA. Before a new paper is stored, a small model checks it is in LabsTrail's field ([0037](0037-labstrail-rates-life-science-and-health-papers.md)): publishing's only use of a model, which decides only whether the paper is refused for its field.
- The Target KA's name derives from the PDF's CID, so publishing the same PDF again converges on the same asset, and the publish function is a singleton on that name. A KA already stored or minted keeps its first submitter: a later submission of the same PDF records nothing.
- The KA links the PDF by its content address (`ipfs://…`); a DOI is metadata only.

## Consequences

- A retry starts again from what the node holds and redoes only what is not there yet ([0007](0007-all-writes-converge.md)): the paper is read and parsed again only when nothing was stored.
- Nothing on chain tracks a publish, so a publish that fails after its retries is recovered by submitting the same PDF again.
- Publishing needs a connected wallet and one signature, but no gas.
- Publishing makes one free-tier Gemini request per new paper, and a second when the first gets no answer; what the answer decides is [0037](0037-labstrail-rates-life-science-and-health-papers.md)'s.
- A signature proves an address, not a person. Every publish costs money (pinning, parsing, node funds), so issuing upload URLs is still rate-limited.
- Pinata (the current pinning service, not part of the decision) and GROBID must both be up to publish. A paper GROBID reads badly gets a poor KA; an LLM cleanup step can be added then. Pinata holds the only copy of each PDF until a second pin is added.

## History

- 2026-10-09: metadata is read from GROBID's structured output by code, not extracted by an LLM, so the same PDF always gives the same KA at no cost per paper (publish plan).
- 2026-10-09: a later submitter of a PDF already stored or minted is not recorded; the KA keeps its first submitter (publish plan).
- 2026-10-10: corrected: the second pin of each PDF is no longer tied to the publish plan, which did not add it; a later plan does.
- 2026-10-10: corrected: the list of metadata fields moved to `packages/core` (README → Target KAs), a mechanic rather than the decision (ADR sweep).
- 2026-10-10: a retry starts again from what the node holds, so a paper is read and parsed again when its store failed before anything was stored, rather than no earlier stage being redone; the code always worked this way, and a re-read costs seconds on a rare retry (README audit, user's choice).
- 2026-10-10: a file that fails the server's check is unpinned only if it is not a PDF and no asset points at it, so an environment with a stricter size limit never unpins a PDF another one published; this ADR did not say when a file is unpinned (branch review, user's choice).
- 2026-10-11: rating is open to papers verisci published, not to any KA (ADR 0011, rating run review).
- 2026-10-12: before a new paper is stored, a small Gemini model checks its field (ADR 0037); the metadata is still read by code, so the same PDF still gives the same KA, and publishing now makes one free-tier model request per new paper (scope and branding plan, user's choice).
- 2026-10-12: the field check's outcomes are left to ADR 0037, which states them all, rather than said here as "refused" (ADR sweep, user's choice).
- 2026-10-12: publishing asks Gemini a second time when the first request gets no answer (ADR 0037), so a new paper uses one or two free-tier requests, not one (branch review, user's choice).
- 2026-10-18: the title is GROBID's, completed from the title the PDF stores in its own metadata when that one ends with GROBID's, since GROBID cut a paper's title; still read by code, so the same PDF still gives the same KA, and a paper published before keeps its record (publish fixes, user's choice).
- 2026-10-18: corrected: GROBID is part of the decision, as the Decision here and [0006](0006-dkg-node-runs-on-a-dedicated-host.md) and [0039](0039-one-credential-per-environment.md) name it; only Pinata is a current choice (ADR sweep, user's choice).
- 2026-10-22: the project renamed LabsTrail, and the signed statement's domain `labstrail`; papers published before keep their `verisci` signature ([0042](0042-the-project-is-named-labstrail.md), user's choice).
