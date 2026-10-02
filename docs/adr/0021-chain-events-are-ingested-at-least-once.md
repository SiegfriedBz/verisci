# 0021. Chain events are ingested at least once

- Status: Accepted
- Date: 2026-10-02

## Context

Rating requests reach verisci as Alchemy webhook calls carrying contract logs. Webhooks are delivered at least once, so the same log can arrive twice, and on a chain reorganization Alchemy re-sends affected logs marked `removed`. The previous route verified the HMAC correctly but neither deduplicated logs nor handled removed ones.

## Decision

- The webhook route verifies the HMAC signature with its environment's secret, in constant time, and rejects a mismatch with 401 before reading the body further.
- Each log becomes one Inngest event whose id is `txHash:logIndex`, so a duplicate delivery collapses into the existing event.
- Logs marked `removed` are ignored: the workflow acts only on logs that are on chain.
- Delivery is not trusted for completeness: a request whose webhook never arrives is still in the contract's pending set, and the reconciler picks it up ([0016](0016-a-cron-reconciler-recovers-stuck-requests.md)).

## Consequences

- A duplicate or replayed webhook never starts a second rating.
- A reorged-out request is never acted on from its stale log; if it reappears on chain, its new log or the reconciler handles it.
- Losing webhooks delays ratings by up to the reconciler's interval; it never loses them.
