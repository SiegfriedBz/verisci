# 0020. Oracle transactions are serialized

- Status: Accepted
- Date: 2026-10-02

## Context

Every `fulfil` and `cancel` is sent from one oracle account. Concurrent workflow runs (the previous repo allowed five) each fetch the next nonce and race: one wins, the others fail with "nonce too low" or replace each other. The oracle key is a hot key held in Vercel's environment, and its balance pays every rating ([0011](0011-rating-requests-are-free-on-testnet.md)).

## Decision

- Every transaction the oracle signs runs under one Inngest concurrency key, the oracle address, with limit 1, shared across functions (`scope: "env"`). Only one oracle transaction is in flight at a time; it waits for its receipt before the next is sent.
- The key is per environment ([0004](0004-staging-and-production-are-isolated.md)), holds only what a few days of ratings need, and its balance raises an alert below a threshold.
- The key is rotated through the contract's `setOracleAgent` (owner only), never by redeploying; the old key is emptied after rotation.

## Consequences

- No nonce races, and a stuck transaction blocks the queue visibly instead of failing silently.
- Oracle throughput is one transaction per confirmation time, ample for testnet volumes; a nonce manager replaces the lock if that ever limits.
- The agents plan wires the lock and the balance alert.
