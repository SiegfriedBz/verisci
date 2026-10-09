# 0005. Staging and production use separate resources

- Status: Accepted
- Date: 2026-10-02

## Context

verisci runs in production (`main`) and staging (`develop`), each at a stable URL that webhooks target. Shared resources would let a staging test write production assets, or one webhook reach two oracles.

## Decision

- Production and staging each have their own contract, context graph (`…/verisci-prod` vs `…/verisci-staging`), Alchemy webhook and secret, oracle wallet and Inngest environment. Feature previews and local development use staging's contract and context graph, but not its oracle key, which only `develop` holds, nor its webhook or Inngest environment (each preview branch gets its own Inngest branch environment, [domain](../domain.md)); a developer running the rating functions locally uses their own contract and key ([0019](0019-oracle-transactions-are-serialized.md)). Previews reach the staging graph only once the node is on its host ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)).
- The DKG node host is shared: one node, one node wallet and one admin token serve both graphs ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)).
- `APP_ENV` names the environment: `local`, `staging` or `production` ([0004](0004-env-variables-per-workspace-one-root-file.md)). A per-environment variable is one name, with one value per Vercel scope.
- The dkg env module refuses a `-prod` context graph unless `APP_ENV=production`, and requires one when it is. Enforced when the dkg env module lands.

## Consequences

- Staging can never touch production's contract, oracle wallet or webhook, and a misconfiguration fails at startup.
- The shared node is the gap: staging's credentials could write the production graph, and both environments spend the same node funds. The `-prod` guard is mandatory until the node supports one token per graph. A node outage takes down both.
- Only `develop` processes staging's ratings, so a rating workflow change is tested end to end on `develop`, not on a preview.
- Every external resource is created twice. Staging's Inngest environment needs auto-archive disabled, or it stops after three quiet days ([domain](../domain.md)).

## History

- 2026-10-09: staging's context graph is `…/verisci-staging` (was `…/verisci`), on a new node with a new agent address, built only from the documented steps; the previous node's graphs are no longer used. Previews reach the staging graph only once the node is on its host, since it runs on a developer's computer until then ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)).
