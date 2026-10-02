# 0010. The contract owns scores, the DKG owns content

- Status: Accepted
- Date: 2026-10-02

## Context

A rating has scores recorded by the contract, one per phase ([0008](0008-ratings-evolve-in-three-phases.md)), and content (rationale, evidence) stored in its R-KA on the DKG. The two can disagree: a mint can fail after scoring, a request can be fulfilled with an R-KA the daemon no longer serves, or a later phase can be recorded before its R-KA is readable.

## Decision

The contract is the authority for scores; the DKG is the authority for content. When they disagree, the UI shows the contract's score and flags the gap rather than picking whichever arrived last. The previous repo already showed the contract's score.

## Consequences

- No reconciliation logic decides a "true" score from two places.
- Disagreements are visible, so they can be investigated and fixed by the reconciler or by hand.
