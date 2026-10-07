# 0031. UALs are normalized before they reach the contract

- Status: Accepted
- Date: 2026-10-06

## Context

The contract lists a target's request ids under the hash of the exact UAL string ([0022](0022-contract-indexes-request-ids-by-target.md)). One Knowledge Asset can be written several ways: a checksummed or lowercase address, an uppercase prefix, surrounding spaces. Each spelling would file that paper's ratings under its own key, and the UI would show only some of them.

## Decision

- Every UAL is normalized to one canonical spelling before it is sent to the contract, used in a DKG lookup or shown in the UI. `@verisci/core` owns the parser and the canonical form.
- Numbers must already be in canonical decimal form: a chain id or id with a leading zero is refused rather than rewritten, as OriginTrail's own UAL rules refuse it.
- The contract stays unchanged and stores whatever string it is given: normalizing is the callers' job.
- The oracle cancels a request whose target UAL is not in canonical form, with reason "invalid target" ([0020](0020-a-cron-reconciler-recovers-stuck-requests.md)), so only canonical targets are ever rated.

## Consequences

- Requests made through the app always use the canonical spelling, so one paper keeps one list of ratings.
- A request sent to the contract directly with another spelling is stored under that spelling, then cancelled by the oracle; it never gets a rating.
- The check lives in our backend, not on chain: it holds as long as the oracle runs it.
- The parser accepts both V10 UAL shapes and does not decide whether a UAL can be rated; the rating workflow does.

## History

- 2026-10-07: corrected the link to ADR 0024, folded into 0020.
