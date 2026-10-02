# 0012. Ratings evolve in three phases

- Status: Accepted
- Date: 2026-10-02

## Context

A machine score alone is a weak quality signal. A rating should grow stronger as people and experiments confirm or refute it.

## Decision

- A rating evolves through three phases: phase 1 a machine score, phase 2 human review, phase 3 wet-lab replication.
- Each phase's score is an integer from 0 to 100, written once on chain.
- The rating's single R-KA holds the rationale ([0011](0011-a-rating-is-a-separate-r-ka.md)): phase 1 mints it, and phases 2 and 3 each add a new version of it under the same UAL. The oracle writes phase 1; who signs phases 2 and 3 is for their ADRs.
- Only phase 1 is built now.

## Consequences

- The contract stores one score per phase, so a later phase never overwrites an earlier one.
- The UI shows which phase a rating has reached, not only a number.
- Only the R-KA's owner can update it, and it is minted to our node's agent, so later phases update it through our node, whoever signs them ([domain](../domain.md)).
- An update is a write like any other, so it must converge: it reads the R-KA's current version first ([0007](0007-all-writes-converge.md)).
