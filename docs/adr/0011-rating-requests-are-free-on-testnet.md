# 0011. Rating requests are free on testnet

- Status: Accepted
- Date: 2026-10-02

## Context

Every rating costs the oracle gas (`fulfil`) and a DKG publish. The previous repo made requests free to keep the first version simple, and named the result a known abuse surface.

## Decision

- Rating requests are free: the requester pays only their own gas. The oracle wallet pays the fulfil gas and sponsors the DKG publish.
- Accepted on testnet only. A payment or rate-limiting plan supersedes this ADR before any mainnet deployment.

## Consequences

- Anyone can drain the oracle wallet by spamming requests. Its balance is alerted on, not just watched ([0020](0020-oracle-transactions-are-serialized.md)).
- No payment logic in the contract or the app for now.
