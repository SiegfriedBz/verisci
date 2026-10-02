# 0011. Rating requests are free on testnet

- Status: Accepted
- Date: 2026-10-02

## Context

Every rating costs an LLM call (real money), the oracle's `fulfil` gas and a DKG publish. The previous repo made requests free to keep the first version simple, and named the result a known abuse surface.

## Decision

- Rating requests are free: the requester pays only their own gas. The oracle wallet pays the fulfil gas, the node's wallet pays the DKG publish (TRAC and gas), and verisci pays the LLM.
- Abuse is bounded, not priced: the contract caps the pending requests per requester, and the rating function is throttled.
- Accepted on testnet only. A payment plan supersedes this ADR before any mainnet deployment.

## Consequences

- Spam costs the attacker only testnet gas, so the caps are what limit spend. The oracle and node wallet balances are alerted on, not just watched ([0020](0020-oracle-transactions-are-serialized.md)).
- The contracts plan sets the per-requester cap; the agents plan sets the throttle.
- No payment logic in the contract or the app for now.
