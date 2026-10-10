# 0005. Staging and production use separate resources

- Status: Accepted
- Date: 2026-10-02

## Context

verisci runs in production (`main`) and staging (`develop`), each at a stable URL that webhooks target. Shared resources would let a staging test write production assets, or one webhook reach two oracles.

## Decision

- Production and staging each have their own contract, context graph (`…/verisci-prod` vs `…/verisci-staging`), Alchemy webhook and secret, oracle wallet, Inngest environment and Upstash store for the upload limits ([0035](0035-limits-are-the-apps-only-state.md)). Feature previews and local development use staging's contract and context graph, and previews staging's Upstash store, but not its oracle key, which only `develop` holds, nor its webhook or Inngest environment (each preview branch gets its own Inngest branch environment, [domain](../domain.md)); a developer running the rating functions locally uses their own contract and key ([0019](0019-oracle-transactions-are-serialized.md)). Previews reach the staging graph only once the node is on its host ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)).
- The DKG node host is shared: one node, its publisher wallets and one admin token serve both graphs ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)).
- The Reown project is shared: one project id serves every environment, with each deployed domain allowed in it ([0034](0034-users-connect-a-wallet-anyone-may-publish.md)). The id is public: the page hands it to the browser.
- The IPFS pinning account is shared: one account pins every environment's PDFs. A refused file is unpinned only if it is not a PDF, which no environment publishes, so one environment never unpins another's paper, even while their size limits differ ([0010](0010-pdf-to-target-ka-pipeline.md)).
- `APP_ENV` names the environment: `local`, `staging` or `production` ([0004](0004-env-variables-per-workspace-one-root-file.md)). A per-environment variable is one name, with one value per Vercel scope.
- The dkg env module refuses a `-prod` context graph unless `APP_ENV=production`, and requires one when it is.

## Consequences

- Staging can never touch production's contract, oracle wallet or webhook, and a misconfiguration fails at startup.
- The shared node is the gap: staging's credentials could write the production graph, and both environments spend the same node funds. The `-prod` guard is mandatory until the node supports one token per graph. A node outage takes down both.
- Only `develop` processes staging's ratings, so a rating workflow change is tested end to end on `develop`, not on a preview.
- Every external resource but the node host, the Reown project and the pinning account is created twice. Staging's test uploads use the same pinning quota as production's. Staging's Inngest environment needs auto-archive disabled, or it stops after three quiet days ([domain](../domain.md)).

## History

- 2026-10-09: staging's context graph is `…/verisci-staging` (was `…/verisci`), on a new node with a new agent address, built only from the documented steps; the previous node's graphs are no longer used. Previews reach the staging graph only once the node is on its host, since it runs on a developer's computer until then ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)).
- 2026-10-09: corrected: the node pays publishes from several publisher wallets, not one; each is funded and alerted on (DKG spike, [domain](../domain.md)).
- 2026-10-09: corrected: dropped "enforced when the dkg env module lands": the module has landed and enforces the guard (DKG client).
- 2026-10-10: each environment has its own Upstash store, so staging and preview traffic never counts against production's limits; one Reown project serves every environment, since its id is public (upload page, ADR sweep).
- 2026-10-10: the IPFS pinning account is shared, since a file is unpinned only when it fails a check every environment applies (upload page, branch review).
- 2026-10-10: a refused file is unpinned only if it is not a PDF (was: when it fails a check every environment applies), since a change to a size limit reaches `develop` before `main` (branch review, user's choice).
