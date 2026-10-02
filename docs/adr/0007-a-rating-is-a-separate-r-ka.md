# 0007. A rating is a separate R-KA, linked by schema:about

- Status: Accepted
- Date: 2026-10-02

## Context

A paper is published as a Target Knowledge Asset (KA). Its quality signal must be added without changing it: the target belongs to its publisher, and editing it would break its provenance.

## Decision

A rating is its own Rating Knowledge Asset (R-KA), stored and minted like any KA, and linked to its target by `schema:about`. The target KA is never modified.

## Consequences

- Anyone can request a rating of any KA, including ones verisci did not publish. Scoring needs our node to read the target: reading KAs from other context graphs is not yet verified on V10, and a target the node cannot read is cancelled, not retried.
- Finding a paper's ratings is a query on `schema:about`, not a field on the paper.
- Each rating costs its own store and mint.
