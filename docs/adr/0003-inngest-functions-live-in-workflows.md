# 0003. Inngest functions live in the workflows package

- Status: Accepted
- Date: 2026-10-02

## Context

Inngest functions combine the dkg and contracts adapters with core logic. Defining them in `web` would mix orchestration into the UI app.

## Decision

Inngest functions are defined in `@verisci/workflows`. `web` only serves them through its `/api/inngest` route.

## Consequences

- Workflows are tested in `workflows` without Next.js.
- `web`'s route stays a thin adapter; adding a workflow does not touch `web`.

## History

- 2026-10-10: the package is renamed `workflows` (was `agents`), since it holds background workflows and none of them uses AI; retitled (was "Inngest workflows live in the agents package"). The decision is unchanged.
- 2026-10-10: corrected: the context no longer says the package keeps adapter code out of `web`'s build; `web` serves the functions, so its build includes it (ADR sweep).
