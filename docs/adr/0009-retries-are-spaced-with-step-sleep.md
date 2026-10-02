# 0009. Retries are spaced with step.sleep

- Status: Accepted
- Date: 2026-10-02

## Context

Mints can fail fast on quorum (`storage_ack_insufficient`, `CORE_TEMPORARILY_UNAVAILABLE`), and retrying a couple of minutes later usually works. Inngest's default backoff starts in seconds: one production run of the previous repo spent all three of its attempts within six minutes against peers that needed longer to recover. The previous repo then threw `RetryAfterError` from inside `step.run` to space retries, which hides the delay in an error path and in the SDK's retry semantics.

## Decision

- Retry delays are an explicit `step.sleep` in the function body, never a `RetryAfterError` thrown inside `step.run`.
- Starting values, measured in the previous repo's production runs: wait 2 minutes after a quorum failure, 5 attempts, and a 45-minute finish budget for a run containing a DKG write. The agents plan may tune them and records why.

## Consequences

- The delay between attempts is visible in the code, testable, and shown in the run timeline.
- The function body carries its own retry loop for these cases instead of relying on step retries.
- After the last attempt the request stays pending and the reconciler takes over ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)).
