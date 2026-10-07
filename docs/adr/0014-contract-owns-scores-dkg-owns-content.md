# 0014. The contract owns scores, the DKG owns content

- Status: Accepted
- Date: 2026-10-02

## Context

A rating has scores on the contract, one per phase ([0012](0012-three-phases-settled-by-the-oracle.md)), and content (rationale, evidence) in its R-KA on the DKG. A phase's score is recorded only after its R-KA version is written, so the contract is never ahead of the DKG. They can still disagree: a request cancelled after its R-KA was written leaves content the contract never recorded, and the daemon can stop serving the R-KA the contract points to.

## Decision

The contract is the authority for scores and for which R-KA counts; the DKG is the authority for content. When they disagree, the UI shows the contract's score and flags the gap.

## Consequences

- No logic decides a "true" score from two places.
- Disagreements are visible, so they can be investigated and fixed.
