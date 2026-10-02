# 0015. Three-phase rating

- Status: Accepted
- Date: 2026-10-02

## Context

A machine score alone is a weak quality signal. The rating is meant to grow stronger over time as people and experiments confirm or refute it.

## Decision

- A rating evolves through three phases: phase 1 a machine score, phase 2 human review, phase 3 wet-lab replication.
- Each phase's score is an integer from 0 to 100, written once on chain by the oracle, with its R-KA holding the rationale.
- Only phase 1 is built now; phases 2 and 3 get their own plans and ADRs.

## Consequences

- The contract stores one score per phase, so a later phase never overwrites an earlier one.
- The UI shows which phase a rating has reached, not only a number.
