# 0010. One reconciler owns recovery

- Status: Accepted
- Date: 2026-10-02

## Context

Requests can get stuck between steps ([0001](0001-names-derive-from-chain-state.md), [0002](0002-store-then-mint.md)). Recovery spread across handlers races itself, and finding stuck requests by scanning logs is not possible: the free Base Sepolia RPC tier caps `eth_getLogs` at 10 blocks.

## Decision

One cron workflow owns recovery. It finds requests stuck past a threshold, reads their real state from chain and daemon, and either finishes them (the R-KA is stored) or cancels them (nothing stored). The contract lists pending request ids, so the reconciler reads current state and never log history.

## Consequences

- One place to reason about, test and observe recovery.
- The contract needs a pending-request list and a cancel path.
- Recovery is delayed by up to the cron interval plus the threshold.
