# 0023. The contract is not upgradeable

- Status: Accepted
- Date: 2026-10-03

## Context

A bug in the rating contract needs a way out. An upgrade proxy keeps one address and its state, but adds an admin key that can change every rule, storage-layout constraints, and a class of bugs of its own. verisci runs on testnet only until a payment plan ([0015](0015-rating-requests-are-free-on-testnet.md)).

## Decision

No upgrade proxy. A fix is a redeploy. The app reads a list of contract addresses per environment: the current one, which takes new requests, and past ones, read-only. Request ids hash the contract address, so ids from two deployments never collide ([0016](0016-asset-names-derive-from-request-id.md)).

## Consequences

- The deployed code is the code that runs; nobody can change its logic afterwards. The owner only sets the oracle and the pending cap.
- Past requests stay on the contract that took them; nothing is migrated.
- The app, the agents and the reconciler must handle several addresses per environment.
- Revisit before mainnet, with the payment plan.
