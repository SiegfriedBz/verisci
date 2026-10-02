# 0016. A cron reconciler recovers stuck requests

- Status: Accepted
- Date: 2026-10-02

## Context

Requests can get stuck between steps ([0012](0012-asset-names-derive-from-request-id.md), [0013](0013-all-writes-converge.md)), or never start because their webhook was lost ([0021](0021-chain-events-are-ingested-at-least-once.md)). The previous repo recovered from the browser that made the request, and finding stuck requests by scanning logs is not possible: the free Base Sepolia RPC tier caps `eth_getLogs` at 10 blocks. Inngest concurrency limits count executing steps, so a sleeping run holds no slot and a concurrency key cannot keep two runs off the same request (see [`docs/domain.md`](../domain.md)).

## Decision

- One function processes a request, whoever starts it: the webhook ([0021](0021-chain-events-are-ingested-at-least-once.md)) or the reconciler. It is a singleton keyed on the request id in skip mode, so while a run for a request is active, any other start for it is skipped, sleeps included.
- Each run reads the request's real state from chain and daemon, then does what is left:
  - not pending (fulfilled or cancelled): stop;
  - R-KA stored: read its score back, never re-score ([0018](0018-phase-1-scorer-output-contract.md)), then mint and fulfil;
  - nothing stored: score, store, mint and fulfil. A score never persisted is safe to compute again.
- The v2 contract keeps an enumerable set of pending request ids with their request time, added on request and removed on fulfil or cancel, so the reconciler reads current state, never log history.
- A cron reconciler reads that set and sends one event per request pending longer than a threshold. The singleton skips those whose run is still active.
- A request older than a maximum age is cancelled on chain instead, and its stored-but-unminted asset is logged as an orphan. Age is read from the contract, so giving up needs no stored attempt count.
- Correctness rests on the singleton, on convergent writes ([0013](0013-all-writes-converge.md)) and on the contract's own checks.
- Cancelling stays open to the owner and the oracle, as in the previous contract.

## Consequences

- One function to reason about, test and observe, whether a request arrives by webhook or by recovery, and no request stays pending forever.
- The contracts plan implements the pending set and the cancel path; the agents plan sets the threshold, the cron interval and the maximum age.
- Recovery is delayed by up to the cron interval plus the threshold.
- Relies on Inngest's `singleton` option; the agents plan checks it in the SDK version it pins.
