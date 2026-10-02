# 0001. Names derive from chain state

- Status: Accepted
- Date: 2026-10-02

## Context

A rating is requested on chain, then stored and minted on the DKG by an oracle. Any of those steps can stop halfway: a closed tab, a timed-out function, a daemon that never answered. The old repo kept the request's transaction hash in the browser's `localStorage`, so only the browser that started a rating could find it again and finish it.

## Decision

Every DKG asset name and every recovery path derives from the on-chain request id. Given a request id, any process can compute the asset name, look up its state on chain and on the daemon, and finish or cancel it. Nothing load-bearing lives in a browser: client storage may cache, never decide.

## Consequences

- Recovery works from any machine, including the reconciler ([0010](0010-one-reconciler-owns-recovery.md)).
- Asset names are deterministic, so a retried store or mint targets the same name instead of creating a duplicate.
- The request id must be unique per deployment; [0008](0008-environment-isolation.md) makes it hash the contract address.
