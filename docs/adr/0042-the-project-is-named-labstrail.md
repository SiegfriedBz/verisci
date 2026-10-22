# 0042. The project is named LabsTrail

- Status: Accepted
- Date: 2026-10-22

## Context

The project was named VeriSci. A 2020 model for checking scientific claims, built at the Allen Institute for AI with the SciFact dataset, has the same name and works in the same field, and VeraSci (VERASCI) is a clinical-trials company, so a search for the name finds them first. The maintainer checked "LabsTrail" on 2026-10-22: no mark in the USPTO's register or in TMview, and the "Lab Trail" marks TMview lists are in cosmetics, health products, education and business, none in science services or software.

## Decision

- The project is named LabsTrail, and `labstrail` in lowercase for the repo, its packages (`@labstrail/*`), its Inngest events and the EIP-712 domain a submitter signs ([0010](0010-pdf-to-target-ka-pipeline.md)). Its one line: "LabsTrail: open, traceable ratings for life-science papers".
- Production's address is `labstrail.vercel.app`; `verisci.vercel.app` is removed.
- Names stored or called outside the repo keep "verisci", so every record already minted and every running service keeps working:
  - the DKG context graphs' names ([0005](0005-staging-and-production-are-isolated.md)), the Knowledge Assets' names (`verisci-tka-`, `verisci-rka-`, [0016](0016-asset-names-derive-from-request-id.md)) and the predicates' namespace `urn:verisci:`
  - the Inngest app id, under which Inngest keeps every function's runs
  - the contracts' source, verified on Basescan, until their next redeploy ([0023](0023-a-fix-is-a-redeploy-owner-powers-fixed.md))
  - the DKG node server's host names, settings and credentials' variable names ([0006](0006-dkg-node-runs-on-a-dedicated-host.md), [0039](0039-one-credential-per-environment.md)), the deployer's keystore account and the pinning gateway's name

## Consequences

- A reader meets "verisci" in a minted record, a graph name, the node's address or the Inngest dashboard; this ADR explains it.
- Papers published before the rename were signed under the domain `verisci`, later ones under `labstrail`; each signature checks under its own name.
- Links to the old address stop working; nothing had been shared before the rename.
- The deployed contracts' NatSpec keeps the old name until a redeploy.
