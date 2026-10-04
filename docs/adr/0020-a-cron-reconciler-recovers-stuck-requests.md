# 0020. A cron reconciler recovers stuck requests

- Status: Amended by [0024](0024-only-the-oracle-cancels-requests.md)
- Date: 2026-10-02

## Context

Requests can stop halfway ([0007](0007-all-writes-converge.md)), or never start because their webhook was lost ([0017](0017-chain-events-are-ingested-at-least-once.md)). The previous repo recovered only from the browser that made the request, and stuck requests cannot be found by scanning logs on the free RPC tier ([domain](../domain.md)).

## Decision

- One function processes a request, whoever starts it, the webhook or the reconciler. It is an Inngest singleton on the request id, so at most one run per request is active.
- Each run reads the request on chain and its R-KA on the daemon, then does what is left of score, store, mint and fulfil. A stored score is read back, never recomputed ([0018](0018-phase-1-scorer-output-contract.md)). Past a maximum age, it fulfils if the R-KA is minted, and otherwise cancels.
- The v2 contract keeps an enumerable set of pending request ids with their request time, so recovery reads current state, never log history.
- A reconciler, an Inngest cron, reads that set and starts the function for every request pending longer than a threshold. It never writes itself.
- A cancel records its reason (maximum age, invalid target, owner), so the UI and alerts can tell them apart.

## Consequences

- One function to reason about, test and observe, and no request stays pending forever.
- Recovery is delayed by up to the cron interval plus the threshold.
- Correctness rests on the singleton, on convergent writes ([0007](0007-all-writes-converge.md)) and on the contract's own checks.
- The function and the reconciler run only where the oracle key is ([0019](0019-oracle-transactions-are-serialized.md)). Staging's reconciler needs crons in a branch environment, which is unverified ([domain](../domain.md)).
- The contracts plan builds the pending set and the cancel path; the agents plan sets the threshold, the cron interval and the maximum age.
