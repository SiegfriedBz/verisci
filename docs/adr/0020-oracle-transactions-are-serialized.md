# 0020. Oracle transactions are serialized

- Status: Accepted
- Date: 2026-10-02

## Context

Every `fulfil` and `cancel` is sent from one oracle account. Concurrent workflow runs (the previous repo allowed five) each fetch the next nonce and race: one wins, the others fail with "nonce too low" or replace each other. The oracle key is a hot key held in Vercel's environment, and its balance pays every rating ([0011](0011-rating-requests-are-free-on-testnet.md)).

## Decision

- Every transaction the oracle signs goes through one dedicated Inngest function. It sends the transaction and waits for its receipt in a single step, with a concurrency limit of 1 keyed on the oracle address. Workflows call it with `step.invoke` instead of signing themselves. (Inngest concurrency limits count running steps, so a key on a whole workflow would serialize all its steps, LLM calls and mints included.)
- A transaction not mined within a timeout is replaced with the same nonce and a higher fee, so one underpriced transaction cannot block the queue.
- The key is per environment ([0004](0004-staging-and-production-are-isolated.md)), holds only what a few days of ratings need, and its balance raises an alert below a threshold.
- The key is rotated through the contract's `setOracleAgent` (owner only), never by redeploying; the old key is emptied after rotation.

## Consequences

- No nonce races, and a stuck transaction is replaced instead of blocking every rating.
- Oracle throughput is one transaction per confirmation time, ample for testnet volumes; a nonce manager replaces the single lane if that ever limits.
- The agents plan builds the oracle function, the replacement timeout and the balance alert.
