# 0019. Publish pipeline

- Status: Accepted
- Date: 2026-10-02

## Context

Papers enter verisci as PDFs and must become Target KAs. Parsing a PDF, extracting metadata with an LLM and writing to the DKG are each slow and each fail in their own way.

## Decision

- Publishing a PDF runs these stages, each its own workflow step: pin the PDF on IPFS, parse it to TEI with GROBID (header and kept body sections), extract structured metadata with an LLM, store the Target KA, then mint it ([0002](0002-store-then-mint.md), [0003](0003-short-steps-async-mint.md)).
- The KA links the PDF by its content address (`ipfs://…`); a DOI is metadata only.
- Current tools: Pinata for pinning, GROBID on the node host ([0016](0016-node-host-topology.md)), Gemini for extraction. They are choices, not part of the decision.

## Consequences

- A failed stage retries alone, and earlier stages are not redone.
- A command-line path may run the same stages in one call, without steps.
- Three external services (Pinata, GROBID, the LLM) must be up to publish.
