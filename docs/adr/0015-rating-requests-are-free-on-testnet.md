# 0015. Rating requests are free on testnet

- Status: Accepted
- Date: 2026-10-02

## Context

Every rating costs an LLM call (real money), the oracle's `fulfil` gas and a DKG publish. The previous repo made requests free to keep the first version simple, and named that an abuse surface.

## Decision

- Rating requests are free: the requester pays only their own gas. The oracle wallet pays the fulfil, the node's publisher wallets pay the DKG publish, and verisci pays the LLM.
- Abuse is bounded, not priced: the contract caps pending requests per requester, and the rating function is throttled.
- Testnet only: a payment plan supersedes this ADR before any mainnet deployment.

## Consequences

- Fresh addresses get around the per-requester cap, so the throttle is the real bound on spend. Every request, spam included, takes at least one run and ends in one oracle transaction, so the throttle is sized against the Inngest execution cap and the oracle's gas ([domain](../domain.md)).
- A spam backlog can delay genuine requests past the maximum age, and they are cancelled ([0020](0020-stuck-requests-recovered-only-oracle-cancels.md)). Accepted on testnet.
- The oracle wallet's and every node publisher wallet's balances are alerted on.
- The contracts plan sets the cap; the rating plan sets the throttle.

## History

- 2026-10-09: corrected: the node pays publishes from several publisher wallets, not one; each is funded and alerted on (DKG spike, [domain](../domain.md)).
- 2026-10-10: corrected: "the agents plan" is now "the rating plan", since the agents package was renamed `workflows`.
