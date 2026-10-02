# 0013. A paper can have several ratings

- Status: Accepted
- Date: 2026-10-02

## Context

In the previous repo the request id was `keccak256(targetUal)`, so a paper could be rated only once. Keying ratings by their paper, or storing "has a rating" as a boolean, would turn a second rating into a migration.

## Decision

- A rating is identified by its own request id ([0016](0016-asset-names-derive-from-request-id.md)), never by its paper; each of its phases adds its own R-KA ([0011](0011-a-rating-is-a-separate-r-ka.md)).
- Rating count is a number, never a boolean.

## Consequences

- Several ratings per paper need no data migration.
- Showing "the" rating of a paper means choosing one explicitly (latest, or by id).
