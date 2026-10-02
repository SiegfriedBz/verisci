# 0017. Chain events are ingested at least once

- Status: Accepted
- Date: 2026-10-02

## Context

Rating requests reach verisci as Alchemy webhook calls carrying contract logs. Webhooks are delivered at least once, so the same log can arrive twice, and on a chain reorganization Alchemy re-sends affected logs marked `removed`. The previous route verified the HMAC correctly but neither deduplicated logs nor handled removed ones.

## Decision

- The webhook route reads the raw body, verifies its HMAC signature with its environment's secret in constant time, and only then parses the JSON. A mismatch is rejected with 401. The staging webhook's URL carries Vercel's deployment-protection bypass, since `develop` is a protected preview deployment ([domain](../domain.md)).
- Only the contract's request log becomes an event (the webhook rule filters on it, and the route ignores any other log, since a fulfil or cancel log carries the same request id). Each becomes one Inngest event whose id is derived from its request id, so a duplicate delivery collapses into the existing event. (`txHash:logIndex` would not: a transaction re-included after a reorg can get a new log index.) Inngest deduplicates ids only within 24 hours; past that, the request's singleton run ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)), convergent writes ([0007](0007-all-writes-converge.md)) and the contract's state stop a repeat.
- The route answers 200 only after its events are accepted by Inngest; if sending fails it answers 5xx, so Alchemy delivers again.
- Logs marked `removed` are ignored, and each run reads the request from the contract before acting, so a request reorged out after delivery is dropped.
- Delivery is not trusted for completeness: a request whose webhook never arrives is still in the contract's pending set, and the reconciler picks it up ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)).

## Consequences

- A duplicate or replayed webhook never starts a second rating, and a failed hand-off to Inngest is retried by Alchemy instead of lost.
- A reorged-out request is never acted on from its stale log; if it reappears on chain with a new id, its new log starts it; with the same id, that log is deduplicated within 24 hours and the reconciler picks it up.
- Losing webhooks delays ratings by the reconciler's recovery delay ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)); it never loses them.
