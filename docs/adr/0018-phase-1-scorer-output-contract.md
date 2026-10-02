# 0018. The phase-1 scorer has a fixed output contract

- Status: Accepted
- Date: 2026-10-02

## Context

Phase 1 scores a Target KA by machine. The previous repo used one Gemini model at temperature 0 over the KA's RDF triples, explicitly as a rough scorer that proves the pipeline, not a calibrated signal. The model will change; what downstream code relies on should not.

## Decision

- The phase-1 scorer reads the target KA's triples and returns `{ score, rationale, observed, missing }`: `score` an integer from 0 to 100, `rationale` text, `observed` and `missing` the signals it found and did not find.
- Its input is capped (a configured number of triples), so one large target cannot multiply the cost of a rating ([0015](0015-rating-requests-are-free-on-testnet.md)).
- Its output is schema-validated before use; anything else (a score out of range, a missing field) fails the step instead of reaching the chain.
- It runs at temperature 0, which reduces variance but does not make a hosted model deterministic. So the score is computed once, persisted in the R-KA, and every later step (retries, the reconciler) reads it back instead of scoring again.
- The R-KA records the model and prompt version that produced the score.
- The model and provider are configuration, not part of this decision. A better scorer (scorer v2) gets its own ADR.

## Consequences

- The R-KA and the contract depend only on this output shape, so changing the model touches no other code.
- The on-chain score always equals the score in the R-KA.
- Score quality is not guaranteed by this ADR, only its shape and its single computation. The target's content is untrusted input to the model: validation bounds the score's shape, not its honesty.
