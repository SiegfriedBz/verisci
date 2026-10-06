# 0031. UALs are normalized before they reach the contract

- Status: Accepted
- Date: 2026-10-06

## Context

The contract lists a target's request ids under the hash of the exact UAL string ([0022](0022-contract-indexes-request-ids-by-target.md)). One Knowledge Asset can be written several ways: a checksummed or lowercase address, an uppercase prefix, surrounding spaces. Each spelling would file that paper's ratings under its own key, and the UI would show only some of them.

## Decision

- Every UAL is normalized to one canonical spelling before it is sent to the contract, used in a DKG lookup or shown in the UI. `@verisci/core` owns the parser and the canonical form.
- Numbers must already be in canonical decimal form: a chain id or id with a leading zero is refused rather than rewritten, as OriginTrail's own UAL rules refuse it.
- The contract stays unchanged and stores whatever string it is given: normalizing is the callers' job.

## Consequences

- One paper keeps one list of ratings, whoever requested them and however they typed the UAL.
- A request sent to the contract directly, without the app, can still use another spelling; its ratings list under that spelling only.
- The parser accepts both V10 UAL shapes and does not decide whether a UAL can be rated; the rating workflow does.
