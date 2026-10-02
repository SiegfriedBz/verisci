# 0011. A rating is a separate R-KA, linked by schema:about

- Status: Accepted
- Date: 2026-10-02

## Context

A paper is published as a Target Knowledge Asset (KA). Its quality signal must be added without changing it: the target belongs to its publisher, and editing it would break its provenance.

## Decision

A rating is its own Rating Knowledge Asset (R-KA), stored and minted like any KA, and linked to its target by `schema:about`. The target KA is never modified.

## Consequences

- Anyone can request a rating of any KA, including ones verisci did not publish. Scoring needs our node to read the target: reading KAs from other context graphs is not yet verified on V10. A target the node cannot read is retried like any failure and cancelled at the maximum age ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)), never at once: a node outage, or a new graph still resolving its authority ([domain](../domain.md)), would otherwise cancel every request in flight. Only a target UAL that can never resolve (it does not parse, or names another chain) is cancelled on its first run.
- A paper carries no field listing its ratings; `schema:about` links each R-KA to it. How the UI lists them is an [open question](README.md#open-questions).
- An R-KA can exist without a fulfilled request: a mint can land after its request is cancelled ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)). A rating counts only if the contract records it fulfilled with that UAL ([0014](0014-contract-owns-scores-dkg-owns-content.md)), so nothing lists ratings by `schema:about` alone.
- Each rating costs its own store and mint.
