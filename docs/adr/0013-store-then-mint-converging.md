# 0013. Store, then mint, and minting converges

- Status: Accepted
- Date: 2026-10-02

## Context

Publishing a Knowledge Asset on the DKG node is two daemon calls: a store (`POST /api/knowledge-assets`) and a mint (`…/{name}/vm/publish`). After a store the asset carries a `reservedUal`; only a mint gives it a `publishedUal`. The daemon refuses a second `vm/publish` on a name that is already minted. The previous repo's client read the state before minting and returned the existing UAL, which made retries and a double click safe.

## Decision

- Publishing is always store, then mint, as two separate steps.
- Before minting, the code reads the asset's `state` (missing, stored, minted) and never infers it from which UAL field is present.
- Minting converges: if the asset is already minted, the mint returns its existing UAL and the flow continues. A blind `vm/publish` on a minted name is an error, and the code never sends one.

## Consequences

- Each step can be retried on its own, and a crash between them leaves a stored asset the reconciler can finish.
- Workflow retries, the reconciler and a repeated user action all converge on the same asset.
- One extra read per mint.
