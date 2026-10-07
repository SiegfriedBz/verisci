# 0009. Retries are spaced with step.sleep

- Status: Accepted
- Date: 2026-10-02

## Context

Mints can fail fast on quorum (`storage_ack_insufficient`, `CORE_TEMPORARILY_UNAVAILABLE`), and a retry a couple of minutes later usually works. Inngest's default retries come within seconds: one production run of the previous repo spent all three attempts in six minutes. That repo then threw `RetryAfterError` inside `step.run`, which hides the delay in an error path.

## Decision

- Retry delays are an explicit `step.sleep` in the function body, never a `RetryAfterError` thrown inside `step.run`.
- Starting values, from the previous repo's production runs: wait 2 minutes after a quorum failure, 5 attempts, and a 45-minute budget for a run that writes to the DKG. The agents plan may tune them, and records why.

## Consequences

- The delay is visible in the code, testable, and shown in the run timeline.
- After the last attempt a rating request stays pending, and the reconciler takes over; a failed publish is recovered by submitting the PDF again ([0010](0010-pdf-to-target-ka-pipeline.md)) ([0020](0020-stuck-requests-recovered-only-oracle-cancels.md)).
