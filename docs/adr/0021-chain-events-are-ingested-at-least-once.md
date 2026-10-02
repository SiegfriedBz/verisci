# 0021. Chain events are ingested at least once

- Status: Accepted
- Date: 2026-10-02

## Context

Rating requests reach verisci as Alchemy webhook calls carrying contract logs. Webhooks are delivered at least once, so the same log can arrive twice, and on a chain reorganization Alchemy re-sends affected logs marked `removed`. The previous route verified the HMAC correctly but neither deduplicated logs nor handled removed ones.

## Decision

- The webhook route reads the raw body, verifies its HMAC signature with its environment's secret in constant time, and only then parses the JSON. A mismatch is rejected with 401.
- Each log becomes one Inngest event whose id is derived from its request id, so a duplicate delivery collapses into the existing event. (`txHash:logIndex` would not: a transaction re-included after a reorg can get a new log index.) Inngest deduplicates ids only within 24 hours; past that, the request's singleton run ([0016](0016-a-cron-reconciler-recovers-stuck-requests.md)), convergent writes ([0013](0013-all-writes-converge.md)) and the contract's state stop a repeat.
- The route answers 200 only after its events are accepted by Inngest; if sending fails it answers 5xx, so Alchemy delivers again.
- Logs marked `removed` are ignored, and each run reads the request from the contract before acting, so a request reorged out after delivery is dropped.
- Delivery is not trusted for completeness: a request whose webhook never arrives is still in the contract's pending set, and the reconciler picks it up ([0016](0016-a-cron-reconciler-recovers-stuck-requests.md)).

## Consequences

- A duplicate or replayed webhook never starts a second rating, and a failed hand-off to Inngest is retried by Alchemy instead of lost.
- A reorged-out request is never acted on from its stale log; if it reappears on chain, its new log or the reconciler handles it.
- Losing webhooks delays ratings by up to the reconciler's interval; it never loses them.
