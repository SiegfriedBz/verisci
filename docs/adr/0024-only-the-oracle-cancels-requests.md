# 0024. Only the oracle cancels requests

- Status: Accepted
- Date: 2026-10-04
- Amends: [0020](0020-a-cron-reconciler-recovers-stuck-requests.md) (the "owner" cancel reason)

## Context

[0020](0020-a-cron-reconciler-recovers-stuck-requests.md) records a reason on every cancel: maximum age, invalid target or owner. The first two say why a request was cancelled; "owner" only says who. No ADR says who may cancel; the "owner" reason implied that the owner could. The owner can already replace the oracle's address, so a separate owner cancel adds a second way to cancel and no capability the system lacks.

## Decision

- Amending 0020: a cancel's reason is maximum age or invalid target. The "owner" reason goes; the rest of 0020 stands.
- New rule: only the oracle cancels a pending request. In an emergency, the owner replaces the oracle's address, and the new oracle cancels.

## Consequences

- Every recorded cancel reason says why the request stopped, for the UI and alerts.
- One role settles requests, by fulfil or cancel ([0019](0019-oracle-transactions-are-serialized.md)).
- While the owner has pointed the oracle role at another key, the backend's oracle transactions fail until it is pointed back.
