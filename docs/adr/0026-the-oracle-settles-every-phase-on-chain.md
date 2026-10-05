# 0026. The oracle settles every phase on chain

- Status: Accepted
- Date: 2026-10-05
- Amends: [0012](0012-ratings-evolve-in-three-phases.md) (who writes phases 2 and 3 on the contract)

## Context

[0012](0012-ratings-evolve-in-three-phases.md) has the oracle agent write phase 1 on the contract and leaves phases 2 and 3 to their own ADRs. [0024](0024-only-the-oracle-cancels-requests.md) makes the oracle agent the one role that settles requests. Phases 2 and 3 bring in human input, such as reviews and lab results, which our backend collects off chain.

## Decision

- Amending 0012: the oracle agent records the result of every phase on the contract, phases 2 and 3 included. Reviewers and labs send their input to our backend, never to the contract.
- For every phase, our DKG node first writes the new version of the rating's R-KA, as 0012 already says; the oracle agent then records that phase's score, which settles that phase.

## Consequences

- One role writes scores and settles requests in every phase, consistent with 0024 and [0019](0019-oracle-transactions-are-serialized.md).
- The contract trusts the oracle agent for every phase's score, so our backend checks the human input before the oracle agent records it. How it checks is for the phase-2 and phase-3 plans.
- Who may request a later phase, and how reviewers are chosen, stay open for the phase-2 plan.
