# 0003. Inngest workflows live in the agents package

- Status: Accepted
- Date: 2026-10-02

## Context

Inngest functions combine the dkg and contracts adapters with core logic. Defining them in `web` would mix orchestration into the UI app and pull adapter code into its build.

## Decision

Inngest functions are defined in `@verisci/agents`. `web` only serves them through its `/api/inngest` route.

## Consequences

- Workflows are tested in `agents` without Next.js.
- `web`'s route stays a thin adapter; adding a workflow does not touch `web`.
