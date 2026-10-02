# 0017. PDFs become Target KAs in a stepped pipeline

- Status: Accepted
- Date: 2026-10-02

## Context

Papers enter verisci as PDFs and must become Target KAs. Parsing a PDF, extracting metadata with an LLM and writing to the DKG are each slow and each fail in their own way. A PDF can exceed the platform's request body limit (see [`docs/domain.md`](../domain.md)), and Inngest caps event payloads and step outputs.

## Decision

- The browser uploads the PDF straight to IPFS pinning with a short-lived signed URL issued by the server, so the file never passes through a Vercel function. The server then checks the pinned file's size and type by its CID before starting the pipeline.
- Events and step outputs carry the CID, never the PDF bytes: each step that needs the file fetches it by CID.
- The pipeline then runs these stages, each its own workflow step: parse to TEI with GROBID (header and kept body sections), extract structured metadata with an LLM, store the Target KA, then mint it ([0013](0013-all-writes-converge.md), [0014](0014-mints-are-async-polled-in-short-steps.md)).
- The Target KA's name derives from the PDF's CID (and the context graph), so publishing the same PDF again converges on the same asset, and recovery never depends on an id kept in a browser.
- The KA links the PDF by its content address (`ipfs://…`); a DOI is metadata only.
- Current tools: Pinata for pinning, GROBID on the node host ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)), Gemini for extraction. They are choices, not part of the decision.

## Consequences

- A failed stage retries alone, and earlier stages are not redone.
- No on-chain record tracks a publish, so nothing recovers one that fails after its retries; submitting the same PDF again converges on the same asset.
- Every publish spends real money (pinning, the LLM) and node funds, so issuing upload URLs is rate-limited; who may publish is for the publish plan.
- A command-line path may run the same stages in one call, without steps.
- Three external services (Pinata, GROBID, the LLM) must be up to publish.
