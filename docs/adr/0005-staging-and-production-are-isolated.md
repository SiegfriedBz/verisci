# 0005. Staging and production use separate resources

- Status: Accepted
- Date: 2026-10-02

## Context

LabsTrail runs in production (`main`) and staging (`develop`), each at a stable URL that webhooks target. Shared resources would let a staging test write production assets, or one webhook reach two oracles.

## Decision

- Production and staging each have their own contract, context graph (`…/verisci-main-prod` vs `…/verisci-staging`), Alchemy Notify webhook and signing key, oracle wallet, Inngest environment, upload-limit counters ([0035](0035-limits-are-the-apps-only-state.md)) and credential for the DKG node server ([0039](0039-one-credential-per-environment.md)). One Telegram chat takes every environment's alerts and activity, each message naming its environment ([0038](0038-alerts-go-to-one-telegram-chat.md)). Feature previews use staging's contract, context graph, upload-limit counters and node credential, but not its oracle key, which only `develop` holds, nor its webhook or Inngest environment (each preview branch gets its own Inngest branch environment, [domain](../domain.md)). Local development uses staging's context graph, through a node credential of its own, and for ratings its own contract and key on Anvil, which the local pages read and request on too ([0019](0019-oracle-transactions-are-serialized.md), [0036](0036-local-rating-runs-use-anvil.md)).
- The DKG node host is shared: one node, its publisher wallets and one admin token, which no environment holds, serve every graph on it ([0006](0006-dkg-node-runs-on-a-dedicated-host.md), [0039](0039-one-credential-per-environment.md)).
- The Reown project is shared: one project id serves every environment, with each deployed domain allowed in it ([0034](0034-users-connect-a-wallet-anyone-may-publish.md)). The id is public: the page hands it to the browser.
- The IPFS pinning account is shared: one account pins every environment's PDFs. A refused file is unpinned only if it is not a PDF, which no environment publishes, so one environment never unpins another's paper, even while their size limits differ ([0010](0010-pdf-to-target-ka-pipeline.md)).
- The Upstash database is shared: Upstash's free plan allows one, so every environment keeps its upload-limit counters in it, each counter named after its environment, and one environment's hits never count against another's.
- The Alchemy RPC account is shared: one Alchemy RPC URL serves every deployment's chain reads and the oracles' transactions (`CHAIN_RPC_URL`), and the node's RPC proxy falls back to the same account within its own daily budget ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)), so all of them share one free account's quota.
- The Gemini key is shared: one key, from one Google project, serves every environment, so their requests share its daily free quota ([0018](0018-phase-1-scorer-output-contract.md), [0037](0037-labstrail-rates-life-science-and-health-papers.md)).
- `APP_ENV` names the environment: `local`, `staging` or `production` ([0004](0004-env-variables-per-workspace-one-root-file.md)). One Vercel project deploys every environment, so a per-environment variable is one name, with one value per Vercel scope.
- The dkg env module refuses a `-prod` context graph unless `APP_ENV=production`, and requires one when it is.

## Consequences

- Staging can never touch production's contract, oracle wallet or webhook, and a misconfiguration fails at startup.
- The shared node is the gap: staging's credentials could write the production graph, and both environments spend the same node funds. The `-prod` guard is mandatory until the node supports one token per graph. A node outage takes down both.
- Only `develop` processes staging's ratings, so a rating workflow change is tested end to end on `develop`, not on a preview.
- Every external resource but the node host, the Vercel project, the Reown project, the pinning account, the Upstash database, the Alchemy RPC account, the Gemini key and the alerts chat is created twice; the node server's credential is created three times, since local development has its own ([0039](0039-one-credential-per-environment.md)). Staging's ratings and test publishes spend the Gemini quota production's need, and staging's and previews' uploads the Upstash database's free usage; an Upstash outage stops new uploads and submissions in every environment ([0035](0035-limits-are-the-apps-only-state.md)). Staging's test uploads use the same pinning quota as production's. Staging's Inngest environment needs auto-archive disabled, or it stops after three quiet days ([domain](../domain.md)).

## History

- 2026-10-09: staging's context graph is `…/verisci-staging` (was `…/verisci`), on a new node with a new agent address, built only from the documented steps; the previous node's graphs are no longer used. Previews reach the staging graph only once the node is on its host, since it runs on a developer's computer until then ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)).
- 2026-10-09: corrected: the node pays publishes from several publisher wallets, not one; each is funded and alerted on (DKG spike, [domain](../domain.md)).
- 2026-10-09: corrected: dropped "enforced when the dkg env module lands": the module has landed and enforces the guard (DKG client).
- 2026-10-10: each environment has its own Upstash store, so staging and preview traffic never counts against production's limits; one Reown project serves every environment, since its id is public (upload page, ADR sweep).
- 2026-10-10: the IPFS pinning account is shared, since a file is unpinned only when it fails a check every environment applies (upload page, branch review).
- 2026-10-10: a refused file is unpinned only if it is not a PDF (was: when it fails a check every environment applies), since a change to a size limit reaches `develop` before `main` (branch review, user's choice).
- 2026-10-15: local development rates on its own Anvil contract, pages included, not on staging's (rating UI, user's choice).
- 2026-10-16: one Telegram chat takes every environment's alerts and activity, each message naming its environment ([0038](0038-alerts-go-to-one-telegram-chat.md)); corrected: the webhook is the Alchemy Notify webhook, and its secret its signing key (intake and recovery).
- 2026-10-16: corrected: the alerts chat joins the resources created once (intake and recovery review).
- 2026-10-16: corrected: the shared chat takes activity as well as alerts ([0038](0038-alerts-go-to-one-telegram-chat.md)) (ADR sweep, user's choice).
- 2026-10-17: each environment, local development included, reaches the shared node with its own credential, and no environment holds the admin token ([0039](0039-one-credential-per-environment.md)); previews reach the staging graph, since the node is on its host ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)) (node server).
- 2026-10-17: the Upstash database and the Gemini key are shared, since Upstash's free plan allows one database and one key keeps the setup simple; each environment's upload-limit counters stay apart by name (first deploy, user's choices).
- 2026-10-17: the Alchemy RPC account is shared too, one URL serving every deployment; the Consequences say what the shared Upstash database and Gemini key share (first deploy, branch review, user's choices).
- 2026-10-17: corrected: one Vercel project deploys every environment, so it joins the resources created once; the node's RPC proxy falls back to the shared Alchemy RPC account, within its own daily budget ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)) (ADR sweep).
- 2026-10-18: corrected: the node server's credential is created three times, not twice, since local development has its own ([0039](0039-one-credential-per-environment.md)) (ADR sweep).
- 2026-10-19: production's context graph is `…/verisci-main-prod` (was `…/verisci-prod`, which OriginTrail's cores keep dormant, [domain](../domain.md)) (fresh production graph, user's choice).
- 2026-10-19: corrected: the node serves every graph on it, the retired `…/verisci-prod` included, not two (ADR sweep, user's choice).
- 2026-10-22: the project renamed LabsTrail ([0042](0042-the-project-is-named-labstrail.md), user's choice).
