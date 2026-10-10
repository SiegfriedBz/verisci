# 0010. PDFs become Target KAs in a stepped pipeline

- Status: Accepted
- Date: 2026-10-02

## Context

Papers enter verisci as PDFs and must become Target KAs. Parsing and the DKG write are each slow and each fail in their own way. A PDF can exceed Vercel's request body limit, and Inngest caps event and step sizes ([domain](../domain.md)). Our node mints every Target KA, so on chain the publisher is always our node: who submitted a paper must be recorded some other way, and provably.

## Decision

- The browser uploads the PDF straight to IPFS pinning with a short-lived signed URL from the server, so the file never passes through a Vercel function. The server checks the pinned file before starting the pipeline.
- The submitter signs an EIP-712 statement of the PDF's CID with their wallet. The server verifies it before publishing, and the Target KA records the submitter's address and signature, so anyone can check who submitted it without trusting verisci. No contract call: rating stays open to any KA ([0011](0011-a-rating-is-a-separate-r-ka.md)).
- Events and step outputs carry the PDF's CID, never its bytes.
- The pipeline runs each stage as its own step: parse with GROBID, store, then mint ([0007](0007-all-writes-converge.md), [0008](0008-mints-are-async-polled-in-short-steps.md)). The metadata (title, authors, abstract, DOI) is read from GROBID's structured output by code, with no LLM, so the same PDF always gives the same KA at no cost per paper.
- The Target KA's name derives from the PDF's CID, so publishing the same PDF again converges on the same asset, and the publish function is a singleton on that name. A KA already stored or minted keeps its first submitter: a later submission of the same PDF records nothing.
- The KA links the PDF by its content address (`ipfs://…`); a DOI is metadata only.

## Consequences

- A failed stage retries alone; earlier stages are not redone.
- Nothing on chain tracks a publish, so a publish that fails after its retries is recovered by submitting the same PDF again.
- Publishing needs a connected wallet and one signature, but no gas.
- A signature proves an address, not a person. Every publish costs money (pinning, parsing, node funds), so issuing upload URLs is still rate-limited.
- Pinata and GROBID (current choices, not part of the decision) must both be up to publish. A paper GROBID reads badly gets a poor KA; an LLM cleanup step can be added then. Pinata holds the only copy of each PDF until a second pin is added.

## History

- 2026-10-09: metadata is read from GROBID's structured output by code, not extracted by an LLM, so the same PDF always gives the same KA at no cost per paper (publish plan).
- 2026-10-09: a later submitter of a PDF already stored or minted is not recorded; the KA keeps its first submitter (publish plan).
- 2026-10-10: corrected: the second pin of each PDF is no longer tied to the publish plan, which did not add it; a later plan does.
