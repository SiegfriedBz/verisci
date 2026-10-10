# 0020. Stuck requests are recovered, and only the oracle cancels

- Status: Accepted
- Date: 2026-10-02

## Context

Requests can stop halfway ([0007](0007-all-writes-converge.md)), or never start because their webhook was lost ([0017](0017-chain-events-are-ingested-at-least-once.md)). The previous repo recovered only from the browser that made the request, and stuck requests cannot be found by scanning logs on the free RPC tier ([domain](../domain.md)).

[0019](0019-oracle-transactions-are-serialized.md) sends every fulfil and cancel from the oracle account. The owner can already replace the oracle's address ([0023](0023-a-fix-is-a-redeploy-owner-powers-fixed.md)), so an owner cancel would add a second way to cancel and no capability the system lacks.

## Decision

- One function processes a request, whoever starts it, the webhook or the reconciler. It is an Inngest singleton on the request id, so at most one run per request is active.
- Each run reads the request on chain and its R-KA on the daemon, then does what is left of score, store, mint and fulfil. A stored score is read back, never recomputed ([0018](0018-phase-1-scorer-output-contract.md)). Past a maximum age, it fulfils if the R-KA is minted, and otherwise cancels.
- The v2 contract keeps an enumerable set of pending request ids with their request time, so recovery reads current state, never log history.
- A reconciler, an Inngest cron, reads that set and starts the function for every request pending longer than a threshold. It never writes itself.
- Only the oracle cancels a pending request, and a cancel records why: maximum age or invalid target. In an emergency, the owner replaces the oracle's address, and the new oracle cancels.

## Consequences

- One function to reason about, test and observe, and no request stays pending forever.
- One role settles requests, by fulfil or cancel ([0019](0019-oracle-transactions-are-serialized.md)), and every recorded cancel reason says why the request stopped, for the UI and alerts.
- Recovery is delayed by up to the cron interval plus the threshold.
- Correctness rests on the singleton, on convergent writes ([0007](0007-all-writes-converge.md)) and on the contract's own checks.
- The function and the reconciler run only where the oracle key is ([0019](0019-oracle-transactions-are-serialized.md)). Staging's reconciler needs crons in a branch environment, which is unverified ([domain](../domain.md)).
- While the owner has pointed the oracle role at another key, the backend's oracle transactions fail until it is pointed back.
- The contracts plan builds the pending set and the cancel path; the rating plan sets the threshold, the cron interval and the maximum age.

## History

- 2026-10-04: only the oracle cancels, and the cancel reasons are maximum age and invalid target. An owner cancel added a second way to cancel and no capability the system lacks, and an "owner" reason said who, not why (was ADR 0024).
- 2026-10-07: ADR 0024 folded into this one, so recovery and cancelling read in one file.
- 2026-10-07: retitled to name everything it now covers (was "A cron reconciler recovers stuck requests").
- 2026-10-10: corrected: "the agents plan" is now "the rating plan", since the agents package was renamed `workflows`.
