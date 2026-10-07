# 0023. The contract is not upgradeable

- Status: Accepted
- Date: 2026-10-03

## Context

A bug in the rating contract needs a way out. An upgrade proxy keeps one address and its state, but adds an admin key that can change every rule, storage-layout constraints, and a class of bugs of its own. verisci runs on testnet only until a payment plan ([0015](0015-rating-requests-are-free-on-testnet.md)).

Requests can still be pending on a contract when it is replaced, and no request stays pending forever ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)). Anyone can keep calling a past contract directly, since its address is public. A lost or exposed owner key needs a way out short of a redeploy.

## Decision

- No upgrade proxy. A fix is a redeploy. The app reads a list of contract addresses per environment: the current one, which takes new requests, and past ones. Request ids hash the contract address, so ids from two deployments never collide ([0016](0016-asset-names-derive-from-request-id.md)).
- After a redeploy, the owner pauses the old contract, and the backend keeps settling the requests still pending on it until none are left. A past contract takes no new requests; its history stays readable. While a contract is paused, fulfil and cancel keep working.
- The owner sets the oracle and the pending cap, pauses and unpauses new requests, and transfers ownership.
- A transfer takes two steps: the owner names the new owner, who then accepts. Ownership never moves to the oracle ([0030](0030-owner-and-oracle-are-different-addresses.md)).
- The owner cannot renounce ownership: the contract always has an owner, who can pause new requests and replace the oracle in an emergency ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)).

## Consequences

- The deployed code is the code that runs; nobody can change its logic afterwards.
- No request stays pending forever across a redeploy, and nothing is migrated: each request settles on the contract that took it.
- The app, the agents and the reconciler read every contract of an environment listed in the deployments file ([0028](0028-deployed-addresses-are-committed.md)), current and past; the agents plan builds that.
- The pause is reversible, so it also stops a wave of spam requests without a redeploy.
- Control of a deployed contract can move to a safer wallet, such as a multisig, or away from an exposed key, with no redeploy. A mistyped address cannot take ownership: an address that never accepts leaves the current owner in place.
- The contract keeps an owner for its whole life, so an emergency always has someone to act.
- Whoever holds the owner key can hand the contract over, so that key stays offline ([0019](0019-oracle-transactions-are-serialized.md), [0030](0030-owner-and-oracle-are-different-addresses.md)).
- Revisit before mainnet, with the payment plan.

## History

- 2026-10-05: past contracts are paused and drained, and the owner can pause and unpause new requests, so requests pending on a replaced contract still settle and a pause can stop a wave of spam (was ADR 0027).
- 2026-10-06: the owner can transfer ownership in two steps, never to the oracle, and cannot renounce, so a lost or exposed owner key is handled without a redeploy and an emergency always has an owner to act (was ADR 0032).
- 2026-10-07: corrected the owner's list to include unpausing, which the contract already had (was ADR 0033). ADRs 0027, 0032 and 0033 folded into this one, so the contract's lifecycle and the owner's powers read in one file.
