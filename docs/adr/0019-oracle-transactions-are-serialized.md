# 0019. Oracle transactions are serialized

- Status: Accepted
- Date: 2026-10-02

## Context

Every `fulfil` and `cancel` is sent from one oracle account. Concurrent workflow runs (the previous repo allowed five) each fetch the next nonce and race: one wins, the others fail with "nonce too low" or replace each other. The oracle key is a hot key held in Vercel's environment, and its balance pays every rating ([0015](0015-rating-requests-are-free-on-testnet.md)).

## Decision

- Every transaction the oracle signs goes through one dedicated Inngest function. In a single step it reads the request's state, decides ([0007](0007-all-writes-converge.md)), sends the transaction and waits for its receipt, with a concurrency limit of 1 keyed on the oracle address. Workflows call it with `step.invoke` instead of signing themselves. (Inngest concurrency limits count executing steps, so a key on a whole workflow would serialize all its steps, LLM calls and mints included.)
- Because the read and the send share that serialized step, no other oracle transaction can land between them.
- A transaction not mined within a timeout is replaced with the same nonce and both fee fields raised by at least the replacement bump ([domain](../domain.md)), up to a fee cap, so one underpriced transaction cannot block the queue. At the cap the step fails and raises an alert: every rating and every cancel waits on this lane, so a stuck lane stalls the whole pipeline.
- A step that starts while the account has a pending transaction (pending nonce above the latest) never sends with a new nonce. It waits for that transaction before reading the request, so the read sees its effect; past the timeout it replaces it with a zero-value transfer to itself at the same nonce, priced one bump above the fee cap, since it holds neither the original payload nor its fees and the cap bounds what any lane transaction carried. The dropped request stays pending, and its own run or the reconciler finishes it ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)).
- The step's timeouts keep it well inside the platform's function limit.
- Only the `main` and `develop` deployments hold an oracle key ([0005](0005-staging-and-production-are-isolated.md)): the limit holds inside one Inngest environment only, and previews and local development each run their own. Those two deployments are also the only ones that serve the rating, reconciler and oracle functions: `@verisci/agents` includes them in the functions it exports only when its env holds the oracle key, and `/api/inngest` stays a thin adapter ([0003](0003-inngest-workflows-live-in-agents.md)). The key is required when `APP_ENV=production` ([0004](0004-each-workspace-declares-its-env.md)), so production never starts without its rating functions; a `develop` missing it shows as a growing oldest pending request. No other environment spends on a request that `develop` is processing: each rating run reads the contract's oracle address with the request, and stops before scoring unless it is its own key's, so a deployment pointed at another environment's contract, or holding a rotated-out key, does nothing.
- The key is per environment, holds only what a few days of ratings need, and its balance raises an alert below a threshold.
- The key is rotated through the contract's `setOracleAgent` (owner only), never by redeploying; the old key is emptied after rotation. The owner key is never held by Vercel or CI.

## Consequences

- No nonce races, and a stuck transaction is replaced instead of blocking every rating.
- A receipt is one confirmation, not finality ([domain](../domain.md)). A fulfil reorged out puts its request back in the pending set, and the reconciler fulfils it again with the same R-KA ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)).
- Oracle throughput is one transaction per confirmation time, ample for testnet volumes; a nonce manager replaces the single lane if that ever limits.
- While it waits for a receipt, the oracle step holds one of the plan's few concurrent step slots ([domain](../domain.md)), so its timeouts are kept short.
- Previews and local development can request ratings but never sign as the oracle.
- Detecting a pending transaction relies on the RPC's pending nonce, and Base has no public mempool ([domain](../domain.md)); the agents plan verifies that Alchemy reports it before relying on it.
- The agents plan builds the oracle function and sets the replacement timeout, the fee cap and the balance alert.
