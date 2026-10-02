# 0015. Rating requests are free on testnet

- Status: Accepted
- Date: 2026-10-02

## Context

Every rating costs an LLM call (real money), the oracle's `fulfil` gas and a DKG publish. The previous repo made requests free to keep the first version simple, and named the result a known abuse surface.

## Decision

- Rating requests are free: the requester pays only their own gas. The oracle wallet pays the fulfil gas, the node's wallet pays the DKG publish (TRAC and gas), and verisci pays the LLM.
- Abuse is bounded, not priced: the contract caps the pending requests per requester, and the rating function is throttled.
- Accepted on testnet only. A payment plan supersedes this ADR before any mainnet deployment.

## Consequences

- Spam costs the attacker only testnet gas, so the caps are what limit spend. Fresh addresses get around the per-requester cap, so the throttle is the real bound on spend.
- Every request, spam included, ends in one run and one oracle transaction (a fulfil, or a cancel at the maximum age), so the throttle is sized against the Inngest execution cap ([domain](../domain.md)) and the oracle's gas budget.
- A spam backlog can delay genuine requests past the maximum age ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)), and they are cancelled. Accepted on testnet.
- The oracle and node wallet balances are alerted on, not just watched ([0019](0019-oracle-transactions-are-serialized.md)).
- The contracts plan sets the per-requester cap; the agents plan sets the throttle.
- No payment logic in the contract or the app for now.
