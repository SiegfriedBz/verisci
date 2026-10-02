# 0008. Environment isolation

- Status: Accepted
- Date: 2026-10-02

## Context

verisci runs in production (`main`) and staging (`develop`), each deployed at a stable URL that webhooks target. Shared resources between them would let a staging test write production assets, or one webhook reach two oracles.

## Decision

- Production and staging each have their own contract, context graph, Alchemy webhook and its secret, oracle wallet and Inngest keys. Feature previews and local development use the staging resources.
- A per-environment variable is one name with two values, scoped in Vercel to Production and Preview.
- `APP_ENV` names the environment (`local`, `staging`, `production`); see [0009](0009-env-declared-where-it-is-read.md). Local and previews use staging *resources* while `APP_ENV` stays `local` or `staging`.
- The dkg env module refuses a `-prod` context graph unless `APP_ENV=production`, and requires one when it is. Decided here; enforced when the dkg package lands.
- Contract request ids hash the contract address, so two deployments never produce the same asset name ([0001](0001-names-derive-from-chain-state.md)).

## Consequences

- A staging run can never touch production assets, and a misconfiguration fails at startup.
- Every new external resource is created twice, and its variable set in both Vercel scopes.
- Previews share staging state, so two previews can see each other's test data.
