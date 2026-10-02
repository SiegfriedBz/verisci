# 0012. Ratings evolve in three phases

- Status: Accepted
- Date: 2026-10-02

## Context

A machine score alone is a weak quality signal. A rating should grow stronger as people and experiments confirm or refute it.

## Decision

- A rating evolves through three phases: phase 1 a machine score, phase 2 human review, phase 3 wet-lab replication.
- Each phase's score is an integer from 0 to 100, written once on chain; that phase's R-KA holds its rationale ([0011](0011-a-rating-is-a-separate-r-ka.md)). The oracle writes phase 1; who signs phases 2 and 3 is for their ADRs.
- Only phase 1 is built now.

## Consequences

- The contract stores one score per phase, so a later phase never overwrites an earlier one.
- The UI shows which phase a rating has reached, not only a number.
