# 0004. Staging and production use separate resources

- Status: Accepted
- Date: 2026-10-02

## Context

verisci runs in production (`main`) and staging (`develop`), each deployed at a stable URL that webhooks target. Shared resources between them would let a staging test write production assets, or one webhook reach two oracles. The previous repo already ran this split, with one DKG node host serving both.

## Decision

- Production and staging each have their own contract, context graph (`…/verisci-prod` vs `…/verisci`), Alchemy webhook and its secret, oracle wallet and Inngest keys. Feature previews and local development use the staging resources, except the oracle key: only the `develop` deployment holds the staging one.
- The DKG node host is the one shared resource: it serves both context graphs, and both must be in its `contextGraphs` config ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)).
- A per-environment variable is one name with two values, scoped in Vercel to Production and Preview.
- `APP_ENV` names the environment (`local`, `staging`, `production`); see [0005](0005-each-workspace-declares-its-env.md). Local and previews use staging *resources* while `APP_ENV` stays `local` or `staging`.
- The dkg env module refuses a `-prod` context graph unless `APP_ENV=production`, and requires one when it is. Decided here; enforced when the dkg package lands.
- Request ids hash the contract address ([0012](0012-asset-names-derive-from-request-id.md)), so two deployments never produce the same asset name.

## Consequences

- A staging run can never touch production contracts, wallets or webhooks, and a misconfiguration fails at startup.
- The shared node is the gap in this isolation: one node wallet serves both graphs, and the daemon has a single admin token (`~/.dkg/auth.token`), so staging credentials could technically write into the production graph, and staging traffic spends the same node funds.
  - Target: one token per graph, so the node itself refuses a staging write to production. Adopted as soon as the node supports scoped tokens; it does not today.
  - Until then, the `-prod` guard in the dkg env module is mandatory before any production write.
- A node outage takes down both environments.
- Previews and local development request ratings on the staging contract, but only the stable `develop` deployment receives webhooks and holds the staging oracle key ([0020](0020-oracle-transactions-are-serialized.md)), so those requests are processed by `develop`'s code. A workflow change cannot be tested end to end on a preview, only on `develop`.
- Every new external resource is created twice, and its variable set in both Vercel scopes.
