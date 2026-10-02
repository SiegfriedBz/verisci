# 0010. One reconciler owns recovery

- Status: Accepted
- Date: 2026-10-02

## Context

Requests can get stuck between steps ([0001](0001-names-derive-from-chain-state.md), [0002](0002-store-then-mint.md)). The previous repo recovered from the browser that made the request, and finding stuck requests by scanning logs is not possible: the free Base Sepolia RPC tier caps `eth_getLogs` at 10 blocks.

## Decision

- One cron workflow owns recovery. It finds requests stuck past a threshold, reads their real state from chain and daemon, and either finishes them (the R-KA is stored: mint it, then fulfil on chain) or cancels them on chain (nothing stored).
- The v2 contract keeps an enumerable set of pending request ids with their request time, added on request and removed on fulfil or cancel, so the reconciler reads current state, never log history.
- Cancelling stays open to the owner and the oracle, as in the previous contract.

## Consequences

- One place to reason about, test and observe recovery.
- The contracts plan implements the pending set and the cancel path.
- Recovery is delayed by up to the cron interval plus the threshold.
