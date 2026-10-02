# 0008. Mints are async, polled in short steps

- Status: Accepted
- Date: 2026-10-02

## Context

A DKG mint takes anywhere from about 5 seconds to over 300. Vercel Hobby stops any function at 300 seconds. The previous repo minted synchronously inside one step with `maxDuration = 300`, the Hobby ceiling, so a slow mint could be cut off mid-call. The daemon finishes a mint even after the client disconnects, and `vm/publish-async` returns a job id to poll.

## Decision

- No workflow step holds a connection longer than one poll. Mints use `vm/publish-async`; the workflow then polls the job, waiting between polls with `step.sleep` (which costs no function time).
- If the job id is lost (a step died after the call returned), or a run finds an asset stored that it did not publish itself (an earlier run's mint may still be in flight), it polls the asset's state by name ([0007](0007-all-writes-converge.md)) for the maximum mint time before publishing, so a lost id never leads to a second mint. Whether the daemon refuses a publish while one is in flight is unverified ([domain](../domain.md)); once it is shown to, this wait can go.

## Consequences

- No mint step can hit Vercel's function time limit, however slow the mint. Every other step (GROBID, the LLM, waiting for a receipt) must also finish well inside that limit, with its own timeout.
- More steps per rating, so more Inngest step executions.
- Resuming a stored asset costs up to one maximum mint time of polling.
- Poll interval and maximum mint time become explicit settings, chosen in the agents plan.
