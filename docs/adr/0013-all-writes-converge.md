# 0013. Every write converges: store, mint and fulfil

- Status: Accepted
- Date: 2026-10-02

## Context

Publishing a Knowledge Asset on the DKG node is two daemon calls: a store (`POST /api/knowledge-assets`) and a mint (`…/{name}/vm/publish`); a rating then ends with the oracle's on-chain `fulfil`. Any of the three can succeed while its response is lost, so every retry may be repeating a write that already happened. The daemon refuses a second `vm/publish` on a minted name, and a second `fulfil` reverts with `NotPending`, wasting gas. The previous repo made the mint and the fulfil read state first; its store generated a fresh subject UUID on each attempt.

## Decision

- Publishing is always store, then mint, as two separate steps.
- Every write reads the current state first and treats "already done" as success:
  - **store:** if the asset is stored or minted, skip, and reuse the stored content (subject ids included) instead of generating new ones;
  - **mint:** read the asset's `state` (missing, stored, minted), never infer it from which UAL field is present; if minted, return the existing UAL;
  - **fulfil:** read the request on chain; if it is already fulfilled with this R-KA, return success without sending a transaction.
- A blind `vm/publish` on a minted name, or a `fulfil` on a settled request, is an error, and the code never sends one.

## Consequences

- Workflow retries, the reconciler and a repeated user action all converge on the same asset and the same on-chain record.
- One extra read per write.
- Content generated at store time (ids, the score) is read back on retry, never regenerated ([0018](0018-phase-1-scorer-output-contract.md)).
