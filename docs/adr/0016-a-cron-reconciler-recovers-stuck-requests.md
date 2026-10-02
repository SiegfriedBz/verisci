# 0016. A cron reconciler recovers stuck requests

- Status: Accepted
- Date: 2026-10-02

## Context

Requests can get stuck between steps ([0012](0012-asset-names-derive-from-request-id.md), [0013](0013-all-writes-converge.md)). The previous repo recovered from the browser that made the request, and finding stuck requests by scanning logs is not possible: the free Base Sepolia RPC tier caps `eth_getLogs` at 10 blocks.

## Decision

- One cron workflow owns recovery. It finds requests pending past a threshold, reads their real state from chain and daemon, and either finishes them (the R-KA is stored: mint it, then fulfil) or cancels them on chain (nothing stored).
- The v2 contract keeps an enumerable set of pending request ids with their request time, added on request and removed on fulfil or cancel, so the reconciler reads current state, never log history. It also heals requests whose webhook never arrived ([0021](0021-chain-events-are-ingested-at-least-once.md)).
- Ownership is decided by the request's age, not by a lock. Inngest concurrency limits count running steps, so a sleeping run holds nothing and cannot exclude another function.
  - The rating run refuses a request older than a start limit (e.g. 10 minutes) and leaves it to the reconciler. With its 45-minute finish budget ([0015](0015-retries-are-spaced-with-step-sleep.md)), every live run has ended by "start limit + 45 minutes".
  - The reconciler only touches requests older than that, plus a margin.
  - The cron sends one event per stuck request to a reconcile function keyed on the request id (concurrency limit 1), so two reconciler runs never handle the same request.
  - Correctness rests on that timing, on convergent writes ([0013](0013-all-writes-converge.md)) and on the contract's own checks.
- Finishing never re-scores: the score is read back from the stored R-KA ([0018](0018-phase-1-scorer-output-contract.md)).
- A request that still cannot be finished after a maximum age or number of reconciler attempts is cancelled on chain, and its stored-but-unminted asset is logged as an orphan.
- Cancelling stays open to the owner and the oracle, as in the previous contract.

## Consequences

- One place to reason about, test and observe recovery, and no request stays pending forever.
- The contracts plan implements the pending set and the cancel path; the agents plan sets the start limit, the threshold, the cron interval and the give-up limits.
- Recovery is delayed by up to the cron interval plus the threshold, and a request delivered later than the start limit always waits for the reconciler.
