# 0035. Limits are the app's only state

- Status: Accepted
- Date: 2026-10-10

## Context

Every publish costs money (pinning, parsing, the node's funds), and anyone with a wallet may publish ([0034](0034-users-connect-a-wallet-anyone-may-publish.md)). The chain and the DKG already hold every fact about papers and ratings, so the app needs no database of its own, only somewhere to count requests.

## Decision

- The chain and the DKG are the only sources of truth. The app keeps no authoritative state.
- Rate-limit counters live in one small key-value store, Upstash Redis. Losing it only resets the limits.
- Upload URLs are limited per connection, since no address is proven before the signature; accepted submissions are limited per signing address.

## Consequences

- No database to migrate or back up.
- A limit store that does not answer stops new uploads and submissions until it is back, rather than letting them through.
- A visitor with many addresses or connections can publish more; the limits bound cost, they do not identify people.
