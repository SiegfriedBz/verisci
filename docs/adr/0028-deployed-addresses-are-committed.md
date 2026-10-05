# 0028. Deployed addresses are committed

- Status: Accepted
- Date: 2026-10-05

## Context

[0023](0023-contract-is-not-upgradeable.md) has the app read a list of contract addresses per environment, current and past, and [0027](0027-past-contracts-are-paused-and-drained.md) has the backend keep settling requests on past ones. The web app and the agents both need staging's and production's lists. An address in an env variable changes outside the repo's history, has to be set on every host, and holds a past list badly.

## Decision

- Staging's and production's deployments live in one file in the contracts package, committed: the current deployment and every past one that took requests, with what each was deployed with. A past deployment that took none, and is paused, has nothing for the backend to settle ([0027](0027-past-contracts-are-paused-and-drained.md)) and may be left out.
- The file changes only after a deploy, through a reviewed PR.
- The app reads staging's and production's addresses from that file. How a local test run targets a developer's own contract ([0019](0019-oracle-transactions-are-serialized.md)) is for the agents plan.

## Consequences

- Which contract each environment uses is visible in git history and reviewed, and every workspace and host sees the same list.
- A redeploy reaches the app only once its commit is merged and deployed; until then the app keeps using the previous contract, which still works until it is paused.
