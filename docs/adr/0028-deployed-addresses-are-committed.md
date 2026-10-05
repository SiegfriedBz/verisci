# 0028. Deployed addresses are committed

- Status: Accepted
- Date: 2026-10-05

## Context

[0023](0023-contract-is-not-upgradeable.md) has the app read a list of contract addresses per environment, current and past, and [0027](0027-past-contracts-are-paused-and-drained.md) has the backend keep settling requests on past ones. The web app, the agents and local development all need the same list. An address in an env variable changes outside the repo's history, has to be set on every host, and holds a past list badly.

## Decision

- Each environment's deployments live in one file in the contracts package, committed: the current deployment and the past ones, with what each was deployed with.
- A deploy writes that file from its broadcast output, never by hand, and the change goes through a PR like any other.
- Every workspace reads the addresses from that file; no env variable holds one.

## Consequences

- Which contract each environment uses is visible in git history and reviewed, and every workspace and host sees the same list.
- A redeploy reaches the app only once its commit is merged and deployed; until then the app keeps using the previous contract, which still works until it is paused.
- Developers running their own contract locally ([0019](0019-oracle-transactions-are-serialized.md)) point their tools at it themselves; the file holds staging and production only.
