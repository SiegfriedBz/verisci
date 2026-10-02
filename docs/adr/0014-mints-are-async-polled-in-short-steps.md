# 0014. Mints are async, polled in short steps

- Status: Accepted
- Date: 2026-10-02

## Context

A DKG mint takes anywhere from about 5 seconds to over 300. Vercel Hobby stops any function at 300 seconds. The previous repo minted synchronously inside one step with `maxDuration = 300`, the Hobby ceiling, so a slow mint could be cut off mid-call. The daemon finishes a mint even after the client disconnects, and `vm/publish-async` returns a job id to poll.

## Decision

No workflow step holds a connection longer than one poll. Mints use `vm/publish-async`; the workflow then polls the job, waiting between polls with `step.sleep` (which costs no function time).

## Consequences

- No step can hit Vercel's function time limit, however slow the mint.
- More steps per rating, so more Inngest step executions.
- Poll interval and give-up threshold become explicit settings, chosen in the agents plan.
