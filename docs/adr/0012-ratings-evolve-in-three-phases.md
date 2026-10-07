# 0012. Ratings evolve in three phases

- Status: Accepted
- Date: 2026-10-02

## Context

A machine score alone is a weak quality signal. A rating should grow stronger as people and experiments confirm or refute it. Phases 2 and 3 bring in human input, such as reviews and lab results, which our backend collects off chain.

## Decision

- A rating evolves through three phases: phase 1 a machine score, phase 2 human review, phase 3 wet-lab replication.
- Each phase's score is an integer from 0 to 100, written once on chain, and only after that phase's R-KA version is written, so the contract is never ahead of the DKG ([0014](0014-contract-owns-scores-dkg-owns-content.md)).
- The rating's single R-KA holds the rationale ([0011](0011-a-rating-is-a-separate-r-ka.md)): phase 1 mints it, and phases 2 and 3 each add a new version of it under the same UAL.
- The oracle agent records the result of every phase on the contract, phases 2 and 3 included. Reviewers and labs send their input to our backend, never to the contract. For every phase, our DKG node first writes the new version of the R-KA; the oracle agent then records that phase's score, which settles that phase.
- Only phase 1 is built now.

## Consequences

- The contract stores one score per phase, so a later phase never overwrites an earlier one.
- The UI shows which phase a rating has reached, not only a number.
- On the DKG, only a KA's owner can update it, and the R-KA is minted to our node's agent ([domain](../domain.md)). So our node writes every phase's R-KA version, as it does in phase 1.
- One role writes scores and settles requests in every phase, consistent with [0019](0019-oracle-transactions-are-serialized.md) and [0020](0020-a-cron-reconciler-recovers-stuck-requests.md) (only the oracle cancels).
- The contract trusts the oracle agent for every phase's score, so our backend checks the human input before the oracle agent records it. How it checks is for the phase-2 and phase-3 plans.
- Who may request a later phase, and how reviewers are chosen, stay open for the phase-2 plan.
- An update is a write like any other, so it must converge: it reads the R-KA's current version first ([0007](0007-all-writes-converge.md)).

## History

- 2026-10-05: the oracle agent records every phase's result on the contract, and reviewers and labs send their input to our backend, so one role writes scores and settles requests in every phase (was ADR 0026).
- 2026-10-07: ADR 0026 folded into this one, so the phases read in one file.
