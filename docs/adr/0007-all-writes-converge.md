# 0007. Every write converges: store, mint, fulfil and cancel

- Status: Accepted
- Date: 2026-10-02

## Context

Publishing a Knowledge Asset takes a store (on DKG 10.0.22, a create and a share) and a mint; a rating then ends with the oracle's on-chain `fulfil` (or a `cancel`). Any of them can succeed while its response is lost, so a retry may repeat a write that already happened. The daemon refuses to store or mint a name again, and its mint refusal is the same whether the asset was never shared or is already minted ([domain](../domain.md)), and the contract reverts a second `fulfil`. The previous repo's store generated new ids on every attempt.

## Decision

- Publishing is always store, then mint, as separate steps; the store includes the share, so a stored asset is ready to mint.
- Every write reads the current state first and treats "already done" as success:
  - **store:** if the asset exists, reuse its stored content (ids included) instead of generating new content, and share it if it is not shared yet;
  - **mint:** read the asset's `state` (never infer it from which UAL field is present); if minted, return its UAL;
  - **fulfil and cancel:** read the request on chain, inside the oracle's serialized step ([0019](0019-oracle-transactions-are-serialized.md)); if it is already settled, send nothing.
- The code never sends a blind mint on a minted name, or a `fulfil` or `cancel` on a settled request.

## Consequences

- Workflow retries, the reconciler and a repeated user action all converge on the same asset and the same on-chain record.
- One extra read per write.
- Content generated at store time (ids, the score) is read back on retry, never regenerated ([0018](0018-phase-1-scorer-output-contract.md)).

## History

- 2026-10-09: the store includes the share, and the daemon's refusals are named, after the DKG spike showed a third call (`swm/share`) between store and mint on 10.0.22, and one refusal code for "not shared" and "already minted" ([domain](../domain.md)).
