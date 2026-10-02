# 0014. The contract owns scores, the DKG owns content

- Status: Accepted
- Date: 2026-10-02

## Context

A rating has scores on the contract, one per phase ([0012](0012-ratings-evolve-in-three-phases.md)), and content (rationale, evidence) in its R-KAs on the DKG. The two can disagree: a mint can fail after scoring, or the daemon can stop serving an R-KA the contract points to.

## Decision

The contract is the authority for scores and for which R-KAs count; the DKG is the authority for content. When they disagree, the UI shows the contract's score and flags the gap.

## Consequences

- No logic decides a "true" score from two places.
- Disagreements are visible, so they can be investigated and fixed.
