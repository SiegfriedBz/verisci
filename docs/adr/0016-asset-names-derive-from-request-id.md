# 0016. Asset names derive from the on-chain request id

- Status: Accepted
- Date: 2026-10-02

## Context

A rating is requested on chain, then scored by our workflow, stored and minted by our DKG node, and recorded on chain by the oracle; any step can stop halfway. In the previous repo the request id was `keccak256(targetUal)`, so a retried request reused it, and the R-KA name also needed the request's transaction hash. Finding that hash takes an `eth_getLogs` scan the free RPC tier cannot serve ([domain](../domain.md)), so only the browser that signed the request kept it, and only that browser could finish a stuck rating.

## Decision

- The v2 contract gives every request its own id: the hash of the chain id, the contract address, a counter, the requester and the target UAL. A retry is a new request.
- Because the id hashes the requester and target, a reorg that reorders requests can never pair one request's rating with another.
- The rating's R-KA name derives from its phase-1 request id ([0011](0011-a-rating-is-a-separate-r-ka.md)). Target KAs are named from their PDF instead ([0010](0010-pdf-to-target-ka-pipeline.md)).
- Nothing load-bearing lives in a browser: client storage may cache, never decide.

## Consequences

- Given a rating's phase-1 request id, any process can compute the R-KA's name and read the state on chain and on the daemon, so recovery needs no browser ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)).
- A retried store or mint targets the same name instead of creating a duplicate.
- Two deployments never produce the same id ([0005](0005-staging-and-production-are-isolated.md)), and several ratings per paper are possible ([0013](0013-several-ratings-per-paper.md)).
