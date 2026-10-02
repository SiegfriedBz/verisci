# 0004. Explicit retry spacing

- Status: Accepted
- Date: 2026-10-02

## Context

Mints can fail fast on quorum (`storage_ack_insufficient`, `CORE_TEMPORARILY_UNAVAILABLE`), and retrying a couple of minutes later usually works. The previous repo threw Inngest's `RetryAfterError` from inside `step.run` to space those retries; there it is silently ignored, and one production run spent all its attempts within six minutes against peers that needed longer to recover.

## Decision

- Retry delays are an explicit `step.sleep` in the function body, never a `RetryAfterError` thrown inside `step.run`.
- Starting values, measured in the previous repo's production runs: wait 2 minutes after a quorum failure, 5 attempts, and a 45-minute finish budget for a run containing a DKG write. The agents plan may tune them and records why.

## Consequences

- The delay between attempts is visible in the code and in the run timeline.
- The function body carries its own retry loop for these cases instead of relying on step retries.
- After the last attempt the request stays pending and the reconciler takes over ([0010](0010-one-reconciler-owns-recovery.md)).
