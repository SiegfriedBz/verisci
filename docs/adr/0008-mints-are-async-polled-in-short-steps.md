# 0008. Mints are async, polled in short steps

- Status: Accepted
- Date: 2026-10-02

## Context

A DKG mint takes from about 5 seconds to over 300, and Vercel Hobby stops any function at 300 seconds. The previous repo minted inside one step, so a slow mint could be cut off. The daemon finishes a mint even after the client disconnects, and the asset's state reads `published` once it is minted. On DKG 10.0.22, `vm/publish-async` is off unless the node runs an async publisher, with wallets set up for it. A KA's id is fixed when it is sealed, so it is minted at most once: a duplicate mint reverts on chain, at the cost of its gas ([domain](../domain.md)).

## Decision

- A step starts the mint with `vm/publish` and stops waiting for its reply well before the function time limit. The workflow then polls the asset's state, waiting between polls with `step.sleep`, which costs no function time; no step waits for a mint to finish.
- A run that finds an asset stored but not minted mints it at once, without waiting for a mint an earlier run may have started. A mint whose asset is still not minted after the maximum mint time is started again.

## Consequences

- The node needs no wallet beyond its own three publisher wallets.
- A mint in flight reads the same as no mint, so a mint started twice (a retry racing an earlier run) costs one reverted transaction's gas. That race is rare and cheaper than waiting the maximum mint time on every recovery.
- No step can hit the function time limit because of a slow mint. Every other step (GROBID, the LLM, the oracle's receipt) must also finish well inside that limit.
- More steps per publish, so more Inngest executions.
- The poll interval and the maximum mint time are settings, chosen in the agents plan.

## History

- 2026-10-09: mints start with `vm/publish` and poll the asset's state instead of using `vm/publish-async`, and a run no longer waits for an earlier mint before minting. The DKG spike showed that the async route needs an extra wallet on 10.0.22, that a mint outlives its client, and that a KA cannot be minted twice ([domain](../domain.md)).
