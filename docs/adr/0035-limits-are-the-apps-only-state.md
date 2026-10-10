# 0035. Limits are the app's only state

- Status: Accepted
- Date: 2026-10-10

## Context

Every publish costs money (pinning, parsing, the node's funds), and anyone with a wallet may publish ([0034](0034-users-connect-a-wallet-anyone-may-publish.md)). The chain and the DKG already hold every record of papers and ratings, and IPFS the PDF files those records name by CID, so the app needs no database of its own, only somewhere to count requests.

## Decision

- The chain and the DKG are the only sources of truth for papers and ratings. The PDF files live on IPFS, pinned by verisci; each Target KA holds its file's CID, which proves which bytes it names ([0010](0010-pdf-to-target-ka-pipeline.md)).
- The app keeps no authoritative state. Its only state today is the rate-limit counters, in a small key-value store, Upstash Redis, one per environment ([0005](0005-staging-and-production-are-isolated.md)). Losing it only resets the limits.
- Where human input waits before the oracle scores it, in phases 2 and 3 ([0012](0012-three-phases-settled-by-the-oracle.md)), is decided by the phase-2 plan.
- Upload URLs are limited per connection, since no address is proven before the signature; accepted submissions are limited per signing address.

## Consequences

- No database to migrate or back up. The PDF files are as safe as their pins: one pinning service holds the only copy until a second pin is added ([0010](0010-pdf-to-target-ka-pipeline.md)).
- A limit store that does not answer stops new uploads and submissions until it is back, rather than letting them through.
- A visitor with many addresses or connections can publish more; the limits bound cost, they do not identify people.
