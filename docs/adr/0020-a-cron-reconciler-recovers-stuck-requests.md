# 0020. A cron reconciler recovers stuck requests

- Status: Accepted
- Date: 2026-10-02

## Context

Requests can get stuck between steps ([0016](0016-asset-names-derive-from-request-id.md), [0007](0007-all-writes-converge.md)), or never start because their webhook was lost ([0017](0017-chain-events-are-ingested-at-least-once.md)). The previous repo recovered from the browser that made the request, and finding stuck requests by scanning logs is not possible: the free Base Sepolia RPC tier caps `eth_getLogs` at 10 blocks. Inngest concurrency limits count executing steps, so a sleeping run holds no slot and a concurrency key cannot keep two runs off the same request (see [`docs/domain.md`](../domain.md)).

## Decision

- One function processes a request, whoever starts it: the webhook ([0017](0017-chain-events-are-ingested-at-least-once.md)) or the reconciler. It is a singleton keyed on the request id in skip mode, so while a run for a request is active, any other start for it is skipped, sleeps included.
- Each run reads the request's real state from chain and daemon, then does what is left:
  - not pending (fulfilled, cancelled or unknown): stop;
  - target UAL that can never resolve ([0011](0011-a-rating-is-a-separate-r-ka.md)): cancel;
  - older than a maximum age: fulfil if its R-KA is minted; if it is stored, first wait out the maximum mint time ([0008](0008-mints-are-async-polled-in-short-steps.md)), since an earlier run's mint may still land; otherwise cancel on chain and log any stored asset as an orphan;
  - R-KA stored: read its score back, never re-score ([0018](0018-phase-1-scorer-output-contract.md)), then mint (after the in-flight wait of [0008](0008-mints-are-async-polled-in-short-steps.md) if this run did not store it) and fulfil;
  - nothing stored: score, store, mint and fulfil. A score never persisted is safe to compute again.
- The v2 contract keeps an enumerable set of pending request ids with their request time, added on request and removed on fulfil or cancel, so the reconciler reads current state, never log history.
- A cron reconciler, an Inngest scheduled function (Vercel Hobby crons run at most daily, [domain](../domain.md)), reads that set and sends one event per request pending longer than a threshold. It never writes itself: giving up happens inside the request's singleton run, so a cancel can never race an active run. The singleton skips requests whose run is still active.
- The reconciler reads the set in pages (a count, then slices by index), and each tick sends at most a set number of events, starting at a page derived from the tick's own time (tick number modulo page count), so every request is reached without storing a cursor (nothing holds state between ticks): spam from fresh addresses ([0015](0015-rating-requests-are-free-on-testnet.md)) can grow the set past what one `eth_call` returns, and past the event volume one tick should send. The reconciler is itself a singleton, so a slow tick never overlaps the next.
- Reconciler events get an id unique to their cron tick (`{requestId}:{tick}`). Reusing the webhook's id ([0017](0017-chain-events-are-ingested-at-least-once.md)) would make Inngest drop them as duplicates for 24 hours; the singleton, not the event id, prevents duplicate runs.
- Age is read from the contract, so giving up needs no stored attempt count. The maximum age exceeds the threshold plus the cron interval plus a run's finish budget ([0009](0009-retries-are-spaced-with-step-sleep.md)), so a run is never given up while it can still succeed.
- Correctness rests on the singleton, on convergent writes ([0007](0007-all-writes-converge.md)) and on the contract's own checks.
- Cancelling stays open to the owner and the oracle, as in the previous contract. A cancel records its reason (maximum age, invalid target, owner) in its event, so the UI and alerts can tell them apart.

## Consequences

- One function to reason about, test and observe, whether a request arrives by webhook or by recovery, and no request stays pending forever.
- The contracts plan implements the pending set and the cancel path; the agents plan sets the threshold, the cron interval, the maximum age and the events per tick.
- Recovery is delayed by up to the cron interval plus the threshold, and under a backlog by the extra ticks needed to reach a request.
- Relies on Inngest's `singleton` option; the agents plan checks it in the SDK version it pins, including with the throttle ([0015](0015-rating-requests-are-free-on-testnet.md)): if runs waiting on the throttle do not count as active, each cron tick queues another run for the same request.
- Staging's reconciler needs crons to run in a branch environment, which is unverified ([domain](../domain.md)).
- The singleton holds within one Inngest environment only, so this function and the reconciler are served only where the oracle key is ([0019](0019-oracle-transactions-are-serialized.md)).
