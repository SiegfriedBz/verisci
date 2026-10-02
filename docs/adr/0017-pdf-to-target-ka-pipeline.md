# 0017. PDFs become Target KAs in a stepped pipeline

- Status: Accepted
- Date: 2026-10-02

## Context

Papers enter verisci as PDFs and must become Target KAs. Parsing a PDF, extracting metadata with an LLM and writing to the DKG are each slow and each fail in their own way.

## Decision

- Publishing a PDF runs these stages, each its own workflow step: pin the PDF on IPFS, parse it to TEI with GROBID (header and kept body sections), extract structured metadata with an LLM, store the Target KA, then mint it ([0013](0013-store-then-mint-converging.md), [0014](0014-mints-are-async-polled-in-short-steps.md)).
- The KA links the PDF by its content address (`ipfs://…`); a DOI is metadata only.
- Current tools: Pinata for pinning, GROBID on the node host ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)), Gemini for extraction. They are choices, not part of the decision.

## Consequences

- A failed stage retries alone, and earlier stages are not redone.
- A command-line path may run the same stages in one call, without steps.
- Three external services (Pinata, GROBID, the LLM) must be up to publish.
