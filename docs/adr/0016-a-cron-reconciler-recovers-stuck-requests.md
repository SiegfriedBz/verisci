# 0016. A cron reconciler recovers stuck requests

- Status: Accepted
- Date: 2026-10-02

## Context

Requests can get stuck between steps ([0012](0012-asset-names-derive-from-request-id.md), [0013](0013-store-then-mint-converging.md)). The previous repo recovered from the browser that made the request, and finding stuck requests by scanning logs is not possible: the free Base Sepolia RPC tier caps `eth_getLogs` at 10 blocks.

## Decision

- One cron workflow owns recovery. It finds requests stuck past a threshold, reads their real state from chain and daemon, and either finishes them (the R-KA is stored: mint it, then fulfil on chain) or cancels them on chain (nothing stored).
- The v2 contract keeps an enumerable set of pending request ids with their request time, added on request and removed on fulfil or cancel, so the reconciler reads current state, never log history.
- Cancelling stays open to the owner and the oracle, as in the previous contract.

## Consequences

- One place to reason about, test and observe recovery.
- The contracts plan implements the pending set and the cancel path.
- Recovery is delayed by up to the cron interval plus the threshold.
