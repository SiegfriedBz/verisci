# 0008. Mints are started, then polled in short steps

- Status: Accepted
- Date: 2026-10-02

## Context

A DKG mint takes from about 5 seconds to over 300, and Vercel Hobby stops any function at 300 seconds. The previous repo minted inside one step, so a slow mint could be cut off. The daemon finishes a mint even after the client disconnects, and the asset's state shows when it is minted. The daemon's own async mint route needs extra publisher setup on the node. An asset's on-chain id is fixed before its mint, so it is minted at most once: a duplicate mint fails, at worst reverting on chain at the cost of its gas ([domain](../domain.md)).

## Decision

- A step starts the mint with the daemon's ordinary mint call and stops listening for its reply well before the function time limit. The workflow then polls the asset's state, waiting between polls with `step.sleep`, which costs no function time; no step waits for a mint to finish.
- A run that finds an asset stored but not minted mints it at once, without waiting for a mint an earlier run may have started. A mint whose asset is still not minted after the maximum mint time is started again.

## Consequences

- The node needs no publisher setup beyond its own wallets.
- A mint in flight reads the same as no mint, so a mint started twice (a retry racing an earlier run) costs one reverted transaction's gas. That race is rare and cheaper than waiting the maximum mint time on every recovery.
- No step can hit the function time limit because of a slow mint. Every other step (GROBID, the LLM, the oracle's receipt) must also finish well inside that limit.
- More steps per publish, so more Inngest executions.
- The poll interval and the maximum mint time are settings, chosen in the agents plan.

## History

- 2026-10-09: retitled (was "Mints are async, polled in short steps"). Mints start with the ordinary mint call and poll the asset's state instead of using the daemon's async route, and a run no longer waits for an earlier mint before minting. The DKG spike showed that the async route needs extra setup on the node, that a mint outlives its client, and that an asset cannot be minted twice ([domain](../domain.md)).
