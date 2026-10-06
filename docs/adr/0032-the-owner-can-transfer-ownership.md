# 0032. The owner can transfer ownership

- Status: Accepted
- Date: 2026-10-06
- Amends: [0023](0023-contract-is-not-upgradeable.md) and [0027](0027-past-contracts-are-paused-and-drained.md) (what the owner can do)

## Context

[0023](0023-contract-is-not-upgradeable.md) and [0027](0027-past-contracts-are-paused-and-drained.md) list what the owner can do: set the oracle and the pending cap, and, since 0027, pause requests. [0030](0030-owner-and-oracle-are-different-addresses.md) relies on a power that list leaves out, transferring ownership, and the contract has it. Without it, a lost or exposed owner key could only be handled by a redeploy.

## Decision

- Amending 0023 and 0027: the owner sets the oracle and the pending cap, pauses requests, and transfers ownership.
- A transfer takes two steps: the owner names the new owner, who then accepts. Ownership never moves to the oracle ([0030](0030-owner-and-oracle-are-different-addresses.md)).
- The owner cannot renounce ownership: the contract always has an owner, who can pause it and replace the oracle in an emergency ([0024](0024-only-the-oracle-cancels-requests.md)).

## Consequences

- Control of a deployed contract can move to a safer wallet, such as a multisig, or away from an exposed key, with no redeploy.
- A mistyped address cannot take ownership: an address that never accepts leaves the current owner in place.
- No call leaves a contract without an owner, so an emergency always has someone to act.
- Whoever holds the owner key can hand the contract over, so that key stays offline ([0019](0019-oracle-transactions-are-serialized.md), [0030](0030-owner-and-oracle-are-different-addresses.md)).
