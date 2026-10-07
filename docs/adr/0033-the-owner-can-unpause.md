# 0033. The owner can unpause new requests

- Status: Accepted
- Date: 2026-10-07
- Amends: [0032](0032-the-owner-can-transfer-ownership.md) (the list of what the owner can do)

## Context

[0027](0027-past-contracts-are-paused-and-drained.md) lets the owner pause and unpause new requests, so a pause can stop a wave of spam and then be lifted. [0032](0032-the-owner-can-transfer-ownership.md) restates the owner's full list of powers and names pausing only. Read on its own, that list leaves the owner unable to lift a pause, while the contract has `unpause`.

## Decision

- Amending 0032: the owner sets the oracle and the pending cap, pauses and unpauses new requests, and transfers ownership.

## Consequences

- The owner's powers are listed in full in one place again, and they match the contract.
- A pause stays reversible, as 0027 intends: the owner lifts it once a spam wave has passed.
