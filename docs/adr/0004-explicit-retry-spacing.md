# 0004. Explicit retry spacing

- Status: Accepted
- Date: 2026-10-02

## Context

Mints can fail fast on quorum (`storage_ack_insufficient`, `CORE_TEMPORARILY_UNAVAILABLE`), and retrying a couple of minutes later usually works. Inngest's `RetryAfterError` looks like the way to space retries, but thrown inside `step.run` it is silently ignored and the step retries on the default schedule.

## Decision

Retry delays are an explicit `step.sleep` in the function body, never a `RetryAfterError` thrown inside `step.run`.

## Consequences

- The delay between attempts is visible in the code and in the run timeline.
- The function body carries its own retry loop for these cases instead of relying on step retries.
