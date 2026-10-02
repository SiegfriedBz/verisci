# 0007. Ratings are plural-ready

- Status: Accepted
- Date: 2026-10-02

## Context

In the previous repo the contract allowed one rating per paper: the request id was `keccak256(targetUal)`, and a paper that had been rated could not be requested again. Keying ratings by their paper, or storing "has a rating" as a boolean, would turn a second rating into a migration.

## Decision

- A rating's identity is its own request id and R-KA UAL, never its paper's ([0001](0001-names-derive-from-chain-state.md)).
- Rating count is a number, never a boolean.
- R-KA means Rating Knowledge Asset ([0014](0014-ratings-are-separate-r-kas.md)).

## Consequences

- Several ratings per paper are possible without a data migration.
- Queries for "the" rating of a paper must choose one explicitly (latest, or by id).
