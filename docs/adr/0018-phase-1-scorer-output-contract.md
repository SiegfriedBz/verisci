# 0018. The phase-1 scorer has a fixed output contract

- Status: Accepted
- Date: 2026-10-02

## Context

Phase 1 scores a Target KA by machine. The previous repo used one Gemini model at temperature 0 over the KA's RDF triples, explicitly as a rough scorer that proves the pipeline, not a calibrated signal. The model will change; what downstream code relies on should not.

## Decision

- The phase-1 scorer reads the target KA's triples and returns `{ score, rationale, observed, missing }`: `score` an integer from 0 to 100, `rationale` text, `observed` and `missing` the signals it found and did not find.
- It runs with deterministic settings (temperature 0), so the same KA scores the same way.
- The model and provider are configuration, not part of this decision. A better scorer (scorer v2) gets its own ADR.

## Consequences

- The R-KA and the contract depend only on this output shape, so changing the model touches no other code.
- Score quality is not guaranteed by this ADR, only its shape and determinism.
