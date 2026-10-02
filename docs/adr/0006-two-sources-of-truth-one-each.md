# 0006. Two sources of truth, one each

- Status: Accepted
- Date: 2026-10-02

## Context

A rating has a score recorded by the contract and content (the review, its evidence) stored on the DKG. The two can disagree: a mint failed, a score was updated, an asset was edited.

## Decision

The contract is the authority for scores; the DKG is the authority for content. When they disagree, the UI shows the contract's score and flags the gap rather than picking whichever arrived last.

## Consequences

- No reconciliation logic decides a "true" score from two places.
- Disagreements are visible, so they can be investigated and fixed by the reconciler or by hand.
