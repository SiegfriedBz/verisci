# 0007. Ratings are plural-ready

- Status: Accepted
- Date: 2026-10-02

## Context

The first version shows one rating per paper. Keying a rating by its paper, or storing "has a rating" as a boolean, would make a second rating per paper a migration later.

## Decision

A rating's identity is its own R-KA (rating Knowledge Asset) UAL, never its paper's. Rating count is a number, never a boolean.

## Consequences

- Several ratings per paper stay possible without a data migration.
- Queries for "the" rating of a paper must choose one explicitly (latest, or by id).
