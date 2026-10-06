# 0022. The contract indexes request ids by target

- Status: Accepted
- Date: 2026-10-03

## Context

A paper can have several ratings ([0013](0013-several-ratings-per-paper.md)), and the UI must list them. Finding them from events would need an `eth_getLogs` scan the free RPC tier cannot serve ([domain](../domain.md)), or an indexer to build and run.

## Decision

The contract keeps, for each target UAL, the list of its phase-1 request ids, oldest first, readable with view calls. The DKG serves each rating's R-KA content on demand ([0014](0014-contract-owns-scores-dkg-owns-content.md)). An indexer comes only if view calls stop being enough.

## Consequences

- The UI lists a paper's ratings from current state, with no log history and no extra service.
- Every request pays a little more gas to append its id.
- The list keeps cancelled requests too, so the UI filters them by status.
