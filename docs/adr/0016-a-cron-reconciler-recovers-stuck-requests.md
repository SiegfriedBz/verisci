# 0016. A cron reconciler recovers stuck requests

- Status: Accepted
- Date: 2026-10-02

## Context

Requests can get stuck between steps ([0012](0012-asset-names-derive-from-request-id.md), [0013](0013-all-writes-converge.md)). The previous repo recovered from the browser that made the request, and finding stuck requests by scanning logs is not possible: the free Base Sepolia RPC tier caps `eth_getLogs` at 10 blocks.

## Decision

- One cron workflow owns recovery. It finds requests pending past a threshold, reads their real state from chain and daemon, and either finishes them (the R-KA is stored: mint it, then fulfil) or cancels them on chain (nothing stored).
- The v2 contract keeps an enumerable set of pending request ids with their request time, added on request and removed on fulfil or cancel, so the reconciler reads current state, never log history. It also heals requests whose webhook never arrived ([0021](0021-chain-events-are-ingested-at-least-once.md)).
- The rating workflow and the reconciler hold the same lock: an Inngest concurrency key on the request id, shared across both functions (`scope: "env"`, limit 1). The threshold is longer than a run's whole finish budget (45 minutes, [0015](0015-retries-are-spaced-with-step-sleep.md)) plus a margin, so the reconciler never races a live run.
- Finishing never re-scores: the score is read back from the stored R-KA ([0018](0018-phase-1-scorer-output-contract.md)).
- A request that still cannot be finished after a maximum age or number of reconciler attempts is cancelled on chain, and its stored-but-unminted asset is logged as an orphan.
- Cancelling stays open to the owner and the oracle, as in the previous contract.

## Consequences

- One place to reason about, test and observe recovery, and no request stays pending forever.
- The contracts plan implements the pending set and the cancel path; the agents plan sets the threshold, the cron interval and the give-up limits.
- Recovery is delayed by up to the cron interval plus the threshold.
