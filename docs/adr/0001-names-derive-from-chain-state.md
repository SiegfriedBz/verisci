# 0001. Names derive from chain state

- Status: Accepted
- Date: 2026-10-02

## Context

A rating is requested on chain, then scored, stored and minted on the DKG by the oracle. Any step can stop halfway. In the previous repo the request id was `keccak256(targetUal)`, so a cancelled-then-retried request reused the same id, and the R-KA name had to include the request's transaction hash (`desci-rating-{requestId}-{txHash}`). That hash is on chain only as the hash of the log's own transaction, and finding it means an `eth_getLogs` scan the free RPC tier cannot serve (10 blocks). So the browser that signed the request kept it in `localStorage`, and only that browser could finish a stuck rating.

## Decision

- The v2 contract gives every request its own id: a counter hashed with the contract address and chain id. A retry is a new request with a new id.
- Every DKG asset name and every recovery derives from that request id alone. Given a request id, any process can compute the asset name, read its state on chain and on the daemon, and finish or cancel it.
- Nothing load-bearing lives in a browser: client storage may cache, never decide.

## Consequences

- Recovery works from any machine, including the reconciler ([0010](0010-one-reconciler-owns-recovery.md)).
- Asset names are deterministic, so a retried store or mint targets the same name instead of creating a duplicate.
- Two deployments never produce the same id ([0008](0008-environment-isolation.md)), and several ratings per paper become possible ([0007](0007-ratings-are-plural-ready.md)).
- Requires the v2 contract; the contracts plan implements the id scheme.
