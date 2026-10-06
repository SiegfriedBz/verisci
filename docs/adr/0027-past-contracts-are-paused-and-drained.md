# 0027. Past contracts are paused and drained

- Status: Amended by [0032](0032-the-owner-can-transfer-ownership.md)
- Date: 2026-10-05
- Amends: [0023](0023-contract-is-not-upgradeable.md) (what "read-only" means for a past contract, and what the owner can do)

## Context

[0023](0023-contract-is-not-upgradeable.md) makes a fix a redeploy and has the app read past contracts read-only. Requests can still be pending on a contract when it is replaced, and [0020](0020-a-cron-reconciler-recovers-stuck-requests.md) says no request stays pending forever. Anyone can also keep calling a past contract directly, since its address is public.

## Decision

- The owner can pause and unpause new requests on a contract. While it is paused, fulfil and cancel keep working.
- Amending 0023: after a redeploy, the owner pauses the old contract, and the backend keeps settling the requests still pending on it until none are left. A past contract takes no new requests; its history stays readable.
- The owner sets the oracle and the pending cap, and pauses requests.

## Consequences

- No request stays pending forever across a redeploy, and nothing is migrated: each request settles on the contract that took it.
- The pause is reversible, so it also stops a wave of spam requests without a redeploy.
- The reconciler and the oracle read every contract of an environment listed in the deployments file ([0028](0028-deployed-addresses-are-committed.md)), current and past; the agents plan builds that.
