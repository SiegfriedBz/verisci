# 0019. Oracle transactions are serialized

- Status: Accepted
- Date: 2026-10-02

## Context

Every `fulfil` and `cancel` is sent from one oracle account. In the previous repo concurrent runs each fetched the next nonce and raced: one won, the others failed or replaced each other. The oracle key is a hot key held by Vercel, and its balance pays every rating.

## Decision

- Every oracle transaction goes through one dedicated Inngest function that runs one at a time. In a single step it reads the request, decides ([0007](0007-all-writes-converge.md)), sends, and waits for the receipt. Workflows call it with `step.invoke` instead of signing themselves.
- A transaction stuck unmined is replaced at the same nonce with higher fees, up to a fee cap; at the cap, the function alerts, since every rating waits on this lane.
- Only the `main` and `develop` deployments hold the production and staging oracle keys, and only they serve the rating, reconciler and oracle functions. Production refuses to start without its key ([0004](0004-each-workspace-declares-its-env.md)).
- A rating run stops before spending anything unless the contract's oracle is its own key. A developer can therefore run the rating functions locally only with their own key, against their own contract.
- Each key holds only a few days of gas and alerts below a threshold. It is rotated through the contract's `setOracleAgent`, owner only; the owner key is never held by Vercel or CI.

## Consequences

- No nonce races, and a stuck transaction cannot block the queue for good.
- One oracle transaction per confirmation time: ample for testnet.
- Previews never sign as the oracle.
- The agents plan builds the function and sets its timeouts, fee cap and alert threshold.
