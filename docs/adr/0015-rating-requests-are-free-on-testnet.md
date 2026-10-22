# 0015. Rating requests are free on testnet

- Status: Accepted
- Date: 2026-10-02

## Context

Every rating costs LLM calls (on Gemini's free tier, capped per day for each model: a field check, and a scorer request per attempt until one is answered, [0018](0018-phase-1-scorer-output-contract.md), [0037](0037-labstrail-rates-life-science-and-health-papers.md)), the oracle's `fulfil` gas and a DKG publish. The previous repo made requests free to keep the first version simple, and named that an abuse surface.

## Decision

- Rating requests are free: the requester pays only their own gas. The oracle wallet pays the fulfil, the node's publisher wallets pay the DKG publish, and LabsTrail pays the LLM.
- Abuse is bounded, not priced: the contract caps pending requests per requester, and the rating function is throttled.
- Testnet only: a payment plan supersedes this ADR before any mainnet deployment.

## Consequences

- Fresh addresses get around the per-requester cap, so the throttle is the real bound on spend. Every request, spam included, takes at least one run and ends in one oracle transaction, so the throttle is sized against the Inngest execution cap and the oracle's gas. The LLM's free daily limit, which every environment shares ([0005](0005-staging-and-production-are-isolated.md)), caps how many papers are rated a day across all of them, staging's and local runs' included; a run that finds it used up tries again like any request the scorer does not answer ([0018](0018-phase-1-scorer-output-contract.md), [domain](../domain.md)).
- A spam backlog can delay genuine requests past the maximum age, and they are cancelled ([0020](0020-stuck-requests-recovered-only-oracle-cancels.md)). Accepted on testnet.
- The oracle wallet's and every node publisher wallet's balances are alerted on ([0038](0038-alerts-go-to-one-telegram-chat.md)).
- The contracts plan sets the cap; the rating plan sets the throttle.

## History

- 2026-10-09: corrected: the node pays publishes from several publisher wallets, not one; each is funded and alerted on (DKG spike, [domain](../domain.md)).
- 2026-10-10: corrected: "the agents plan" is now "the rating plan", since the agents package was renamed `workflows`.
- 2026-10-12: corrected: the LLM call runs on Gemini's free tier, capped per day (ADR 0018), not at a cost per call, and that daily cap bounds ratings too (ADR sweep, user's choice).
- 2026-10-16: the balances are alerted on through the one alerts chat ([0038](0038-alerts-go-to-one-telegram-chat.md)) (intake and recovery).
- 2026-10-16: corrected: a rating costs a field check and a scorer request per attempt until one is answered, each model with its own daily cap ([0018](0018-phase-1-scorer-output-contract.md), [0037](0037-labstrail-rates-life-science-and-health-papers.md)), not one LLM call (ADR sweep and branch review, user's choices).
- 2026-10-17: corrected: the throttle is sized against the Inngest execution cap and the oracle's gas; the LLM's daily limit, which every environment shares ([0005](0005-staging-and-production-are-isolated.md)), caps the papers rated a day across all of them (ADR sweep).
- 2026-10-22: the project renamed LabsTrail ([0042](0042-the-project-is-named-labstrail.md), user's choice).
