# 0011. A rating is a separate R-KA, linked by schema:about

- Status: Accepted
- Date: 2026-10-02

## Context

A paper is published as a Target Knowledge Asset (KA). Its quality signal must be added without changing it: the target belongs to its publisher, and editing it would break its provenance.

## Decision

A rating is one Rating Knowledge Asset (R-KA), linked to its target by `schema:about`. Phase 1 stores and mints it; later phases update that same R-KA, which keeps its UAL and every earlier version ([0012](0012-three-phases-settled-by-the-oracle.md)). The target KA is never modified.

Only a paper LabsTrail published can be rated: a Target KA our node minted in the environment's context graph. The rating run checks it first, and the oracle cancels a request for any other KA at once, with reason "invalid target" ([0020](0020-stuck-requests-recovered-only-oracle-cancels.md)). The paper must also be in LabsTrail's field ([0037](0037-labstrail-rates-life-science-and-health-papers.md)), and its PDF must hold text the scorer can read ([0018](0018-phase-1-scorer-output-contract.md)), and the scorer must not give two answers its check refuses (a request it does not answer is tried again, [0018](0018-phase-1-scorer-output-contract.md)); a request for any other paper is cancelled "invalid target" too, before anything is stored.

## Consequences

- Anyone can request a rating of any paper LabsTrail published in its field, whoever submitted it.
- A KA published elsewhere is never rated: scoring needs the paper as LabsTrail's publish run read it, and our node reads only its own graph without another graph's id, which a UAL does not carry. A request for one is cancelled at once rather than kept open.
- If our node does not answer, the run retries and does not cancel: the paper may exist ([0020](0020-stuck-requests-recovered-only-oracle-cancels.md)).
- An R-KA can exist without a fulfilled request (a mint can land after a cancel), so the contract, not `schema:about`, says which R-KAs count ([0014](0014-contract-owns-scores-dkg-owns-content.md)).
- Each rating costs one store and mint, and each later phase one update.

## History

- 2026-10-09: reading another node's KA is shown to work given its context graph id (DKG spike); finding that id became an open question.
- 2026-10-11: only papers verisci published can be rated; a request for any other KA is cancelled at once (rating run review). This closes the open question on other nodes' context graphs.
- 2026-10-11: a paper outside VeriSci's field, or whose PDF holds no readable text, is cancelled "invalid target" too, since the scorer checks the paper against its kind of study's checklist (scorer v2 plan, ADR 0037).
- 2026-10-16: a paper the scorer gives two answers its check refuses is cancelled "invalid target": the same paper tends to give the same answer, and each restart by the reconciler would spend the scorer's daily quota again (intake and recovery, user's choice).
- 2026-10-17: corrected: the cancel counts the scorer's answers its check refuses, not its tries, so a scorer outage never cancels a paper ([0018](0018-phase-1-scorer-output-contract.md)) (ADR sweep).
- 2026-10-22: the project renamed LabsTrail ([0042](0042-the-project-is-named-labstrail.md), user's choice).
