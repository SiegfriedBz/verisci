# 0025. Reviews gate on ADR consistency and Foundry lint

- Status: Accepted
- Date: 2026-10-04

## Context

The branch review read code and docs but never the ADRs, so code could contradict an accepted ADR, or a new ADR an older one, without anyone being told. Earlier passes that reviewed every ADR at once kept adding detail and creating new contradictions. Foundry's linter printed its findings during builds, but nothing failed on them.

## Decision

- Every branch review checks what the branch touches against the accepted ADRs: its code, the ADRs it adds or changes, and the ADRs those cite or are cited by. A conflict blocks the PR until the user decides to amend an ADR, supersede it, or change the code.
- The review reports conflicts and the options; it never proposes new wording and never edits.
- A check of all ADRs against each other runs only on demand.
- Every Foundry lint finding, warnings and notes alike, fails the checks, after each edit and in CI. A lint whose advice costs readability for little gain is excluded by name, with the reason next to it.

## Consequences

- A contradiction surfaces in the PR that creates it, while its author can still change it.
- A PR can wait on the user's decision, not only on a fix.
- Naming and gas suggestions are enforced, not just printed; each exclusion is visible and justified.
- Reviewing one branch stays bounded by what it touches; the full check is a deliberate act.
