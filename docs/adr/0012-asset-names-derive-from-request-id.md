# 0012. Asset names derive from the on-chain request id

- Status: Accepted
- Date: 2026-10-02

## Context

A rating is requested on chain, then scored, stored and minted on the DKG by the oracle. Any step can stop halfway. In the previous repo the request id was `keccak256(targetUal)`, so a cancelled-then-retried request reused the same id, and the R-KA name had to include the request's transaction hash (`desci-rating-{requestId}-{txHash}`). That hash is on chain only as the hash of the log's own transaction, and finding it means an `eth_getLogs` scan the free RPC tier cannot serve (10 blocks). So the browser that signed the request kept it in `localStorage`, and only that browser could finish a stuck rating.

## Decision

- The v2 contract gives every request its own id: the hash of the chain id, the contract address, a counter, the requester and the target UAL. A retry is a new request with a new id.
- Hashing the requester and target binds the id to its content: if a reorg drops a request and another takes its counter, that other request gets a different id, so a run can never fulfil one request with another's rating.
- Every rating asset name (with its phase, [0008](0008-ratings-evolve-in-three-phases.md)) and every recovery derives from that request id. Given a request id, any process can compute the asset name, read its state on chain and on the daemon, and finish or cancel it. Target KAs are named from their PDF instead ([0017](0017-pdf-to-target-ka-pipeline.md)).
- Nothing load-bearing lives in a browser: client storage may cache, never decide.

## Consequences

- Recovery works from any machine, including the reconciler ([0016](0016-a-cron-reconciler-recovers-stuck-requests.md)).
- Asset names are deterministic, so a retried store or mint targets the same name instead of creating a duplicate.
- Two deployments never produce the same id ([0004](0004-staging-and-production-are-isolated.md)), and several ratings per paper become possible ([0009](0009-several-ratings-per-paper.md)).
- Requires the v2 contract; the contracts plan implements the id scheme.
