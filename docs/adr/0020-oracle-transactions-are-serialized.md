# 0020. Oracle transactions are serialized

- Status: Accepted
- Date: 2026-10-02

## Context

Every `fulfil` and `cancel` is sent from one oracle account. Concurrent workflow runs (the previous repo allowed five) each fetch the next nonce and race: one wins, the others fail with "nonce too low" or replace each other. The oracle key is a hot key held in Vercel's environment, and its balance pays every rating ([0011](0011-rating-requests-are-free-on-testnet.md)).

## Decision

- Every transaction the oracle signs goes through one dedicated Inngest function. In a single step it reads the request's state, decides ([0013](0013-all-writes-converge.md)), sends the transaction and waits for its receipt, with a concurrency limit of 1 keyed on the oracle address. Workflows call it with `step.invoke` instead of signing themselves. (Inngest concurrency limits count executing steps, so a key on a whole workflow would serialize all its steps, LLM calls and mints included.)
- Because the read and the send share that serialized step, no other oracle transaction can land between them.
- A transaction not mined within a timeout is replaced with the same nonce and a higher fee, so one underpriced transaction cannot block the queue. A step that starts while the account has a pending transaction (pending nonce above the latest) waits for or replaces it first, never sends with a new nonce. The step's timeouts keep it well inside the platform's function limit.
- Only the `main` and `develop` deployments hold an oracle key ([0004](0004-staging-and-production-are-isolated.md)): the limit holds inside one Inngest environment only, and previews and local development each run their own.
- The key is per environment, holds only what a few days of ratings need, and its balance raises an alert below a threshold.
- The key is rotated through the contract's `setOracleAgent` (owner only), never by redeploying; the old key is emptied after rotation. The owner key is never held by Vercel or CI.

## Consequences

- No nonce races, and a stuck transaction is replaced instead of blocking every rating.
- Oracle throughput is one transaction per confirmation time, ample for testnet volumes; a nonce manager replaces the single lane if that ever limits.
- Previews and local development can request ratings but never sign as the oracle.
- The agents plan builds the oracle function, the replacement timeout and the balance alert.
