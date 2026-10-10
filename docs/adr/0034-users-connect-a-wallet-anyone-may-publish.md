# 0034. Users connect a wallet, and anyone may publish

- Status: Accepted
- Date: 2026-10-10

## Context

The upload page needs to know who submits a paper. A submission is already authorized by its EIP-712 signature, which the Target KA records ([0010](0010-pdf-to-target-ka-pipeline.md)), so the page needs a wallet to sign with, not accounts of its own. Researchers use browser wallets, phone wallets and, more and more, email-based wallets.

## Decision

- Visitors connect a wallet through Reown AppKit with wagmi, on Base Sepolia only, the chain the Submission's EIP-712 domain names.
- Anyone with a wallet may publish: there is no allowlist and no sign-in session. The signature authorizes each submission.
- A session (SIWE) is added only when a feature needs one.

## Consequences

- Browser, phone and email wallets all work, through one window.
- Reown is a dependency: the page needs a Reown project id, from one project shared by every environment, and each deployed domain must be allowed in that project ([0005](0005-staging-and-production-are-isolated.md)).
- With no account to check, cost is bounded by limits per connection and per signing address ([0035](0035-limits-are-the-apps-only-state.md)).
