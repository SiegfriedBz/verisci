# 0011. A rating is a separate R-KA, linked by schema:about

- Status: Accepted
- Date: 2026-10-02

## Context

A paper is published as a Target Knowledge Asset (KA). Its quality signal must be added without changing it: the target belongs to its publisher, and editing it would break its provenance.

## Decision

A rating is one Rating Knowledge Asset (R-KA), linked to its target by `schema:about`. Phase 1 stores and mints it; later phases update that same R-KA, which keeps its UAL and every earlier version ([0012](0012-three-phases-settled-by-the-oracle.md)). The target KA is never modified.

## Consequences

- Anyone can request a rating of any KA, including ones verisci did not publish. Scoring needs our node to read the target. It reads KAs from other nodes' context graphs given the graph's id, which a request's UAL does not carry; where that id comes from is an open question ([README](README.md#open-questions), [domain](../domain.md)); a target it cannot read is retried, then cancelled at the maximum age ([0020](0020-stuck-requests-recovered-only-oracle-cancels.md)).
- An R-KA can exist without a fulfilled request (a mint can land after a cancel), so the contract, not `schema:about`, says which R-KAs count ([0014](0014-contract-owns-scores-dkg-owns-content.md)).
- Each rating costs one store and mint, and each later phase one update.

## History

- 2026-10-09: reading another node's KA is shown to work given its context graph id (DKG spike); finding that id became an open question.
