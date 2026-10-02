# 0002. Store, then mint

- Status: Accepted
- Date: 2026-10-02

## Context

Publishing a Knowledge Asset on the DKG node is two daemon calls: a store (`POST /api/knowledge-assets`) and a mint (`…/{name}/vm/publish`). After a store the asset carries a `reservedUal`; only a mint gives it a `publishedUal`. The old repo inferred state from which UAL field was present and treated a repeated mint as harmless, which hid failed and double mints.

## Decision

Publishing is always store, then mint, as two separate steps. Before minting, the code reads the asset's `state` (missing, stored, minted) and never infers it from which UAL field is present. Minting an asset that is already minted is an error, not a no-op.

## Consequences

- Each step can be retried on its own, and a crash between them leaves a stored asset the reconciler can finish.
- One extra read per mint.
- A double mint surfaces as an error to investigate instead of passing silently.
