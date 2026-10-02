# 0004. Staging and production use separate resources

- Status: Accepted
- Date: 2026-10-02

## Context

verisci runs in production (`main`) and staging (`develop`), each deployed at a stable URL that webhooks target. Shared resources between them would let a staging test write production assets, or one webhook reach two oracles. The previous repo already ran this split, with one DKG node host serving both.

## Decision

- Production and staging each have their own contract, context graph (`…/verisci-prod` vs `…/verisci`), Alchemy webhook and its secret, oracle wallet and Inngest keys. Feature previews and local development use the staging resources.
- The DKG node host is the one shared resource: it serves both context graphs, and both must be in its `contextGraphs` config ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)).
- A per-environment variable is one name with two values, scoped in Vercel to Production and Preview.
- `APP_ENV` names the environment (`local`, `staging`, `production`); see [0005](0005-each-workspace-declares-its-env.md). Local and previews use staging *resources* while `APP_ENV` stays `local` or `staging`.
- The dkg env module refuses a `-prod` context graph unless `APP_ENV=production`, and requires one when it is. Decided here; enforced when the dkg package lands.
- Request ids hash the contract address ([0012](0012-asset-names-derive-from-request-id.md)), so two deployments never produce the same asset name.

## Consequences

- A staging run can never touch production assets, and a misconfiguration fails at startup.
- A node outage takes down both environments.
- Every new external resource is created twice, and its variable set in both Vercel scopes.
