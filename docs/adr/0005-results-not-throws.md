# 0005. Results, not throws

- Status: Accepted
- Date: 2026-10-02

## Context

Server reads and server actions run behind React Server Components. In production React redacts the message of any error thrown to the client, so the UI can only show "something went wrong". The previous repo's reads threw on DKG or RPC failure so server components could show an "unavailable" state, which tied that UI to error boundaries. The opposite habit, catching an error and returning empty data, makes an outage look like "no ratings yet".

## Decision

Server reads and actions return typed results (`ok`, `unavailable`, `not-found`, …). They never throw to the client and never swallow an error into empty data.

## Consequences

- The UI can tell "nothing here" from "could not load" and show each honestly.
- Every caller handles each result variant; TypeScript enforces it.
- Programming errors (bugs) may still throw; this is about expected failures.
