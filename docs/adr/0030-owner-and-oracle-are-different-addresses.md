# 0030. The owner and the oracle are different addresses

- Status: Accepted
- Date: 2026-10-05

## Context

[0019](0019-oracle-transactions-are-serialized.md) puts the oracle's key on the `main` and `develop` deployments, where the rating functions sign with it, and keeps the owner's key away from Vercel and CI. The owner can pause requests, replace the oracle and transfer ownership ([0023](0023-contract-is-not-upgradeable.md)). If one address held both roles, putting the oracle's key on a server would put the owner's powers there too. The first staging deploy did exactly this, by passing the deployer's own address as the oracle.

## Decision

- The contract keeps the owner and the oracle at different addresses: it rejects an oracle equal to the owner, and ownership moving to the oracle.
- In an emergency, the owner points the oracle role at another key it controls.

## Consequences

- A mistaken deploy or admin call fails on chain instead of silently merging the two roles.
- Each environment needs two wallets: the deployer, which becomes the owner and stays offline, and the oracle, whose key goes to that environment's deployment.
- A leaked oracle key costs the oracle role only; the owner replaces it with `setOracleAgent`.

## History

- 2026-10-07: corrected the link for the owner's powers to ADR 0023, which now lists them all (ADRs 0024 and 0027 merged into 0020 and 0023).
