# 0010. PDFs become Target KAs in a stepped pipeline

- Status: Accepted
- Date: 2026-10-02

## Context

Papers enter verisci as PDFs and must become Target KAs. Parsing, LLM extraction and the DKG write are each slow and each fail in their own way. A PDF can exceed Vercel's request body limit, and Inngest caps event and step sizes ([domain](../domain.md)). Our node mints every Target KA, so on chain the publisher is always our node: who submitted a paper must be recorded some other way, and provably.

## Decision

- The browser uploads the PDF straight to IPFS pinning with a short-lived signed URL from the server, so the file never passes through a Vercel function. The server checks the pinned file before starting the pipeline.
- The submitter signs an EIP-712 statement of the PDF's CID with their wallet. The server verifies it before publishing, and the Target KA records the submitter's address and signature, so anyone can check who submitted it without trusting verisci. No contract call: rating stays open to any KA ([0011](0011-a-rating-is-a-separate-r-ka.md)).
- Events and step outputs carry the PDF's CID, never its bytes.
- The pipeline runs each stage as its own step: parse with GROBID, extract metadata with an LLM, store, then mint ([0007](0007-all-writes-converge.md), [0008](0008-mints-are-async-polled-in-short-steps.md)).
- The Target KA's name derives from the PDF's CID, so publishing the same PDF again converges on the same asset, and the publish function is a singleton on that name.
- The KA links the PDF by its content address (`ipfs://…`); a DOI is metadata only.

## Consequences

- A failed stage retries alone; earlier stages are not redone.
- Nothing on chain tracks a publish, so a publish that fails after its retries is recovered by submitting the same PDF again.
- Publishing needs a connected wallet and one signature, but no gas.
- A signature proves an address, not a person. Every publish costs money (pinning, the LLM, node funds), so issuing upload URLs is still rate-limited.
- Pinata, GROBID and the LLM (current choices, not part of the decision) must all be up to publish. Pinata holds the only copy of each PDF until the publish plan adds a second pin.
