# 0008. Mints are async, polled in short steps

- Status: Accepted
- Date: 2026-10-02

## Context

A DKG mint takes from about 5 seconds to over 300, and Vercel Hobby stops any function at 300 seconds. The previous repo minted inside one step, so a slow mint could be cut off. The daemon finishes a mint even after the client disconnects, and `vm/publish-async` returns a job id to poll.

## Decision

- Mints use `vm/publish-async`. The workflow polls the job, waiting between polls with `step.sleep`, which costs no function time; no step waits for a mint to finish.
- A run that finds an asset stored by an earlier run polls its state for up to the maximum mint time before publishing it: that earlier mint may still be in flight, and whether a second publish would mint twice is unverified ([domain](../domain.md)).

## Consequences

- No step can hit the function time limit because of a slow mint. Every other step (GROBID, the LLM, the oracle's receipt) must also finish well inside that limit.
- More steps per publish, so more Inngest executions.
- The poll interval and the maximum mint time are settings, chosen in the agents plan.
