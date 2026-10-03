# 0018. The phase-1 scorer has a fixed output contract

- Status: Accepted
- Date: 2026-10-02

## Context

Phase 1 scores a Target KA by machine. The previous repo used one Gemini model at temperature 0 over the KA's triples, as a rough scorer to prove the pipeline, not a calibrated signal. The model will change; what downstream code relies on should not.

## Decision

- The scorer reads the target KA's triples, capped at a configured number, and returns `{ score, rationale, observed, missing }`: `score` an integer from 0 to 100, `rationale` text, `observed` and `missing` the signals it found and did not find.
- Its output is schema-validated; anything else fails the step instead of reaching the chain.
- A hosted model is not deterministic, even at temperature 0, so the score is computed once, persisted in the R-KA, and read back by every retry.
- The R-KA records the model and prompt version. The model and provider are configuration; a better scorer gets its own ADR.

## Consequences

- Changing the model touches no other code.
- The on-chain score always equals the score in the R-KA.
- This ADR guarantees the score's shape, not its quality. The target's content is untrusted input to the model.
