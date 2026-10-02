# 0006. The DKG node runs on a dedicated host

- Status: Accepted
- Date: 2026-10-02

## Context

A DKG node is a long-lived peer-to-peer daemon, and GROBID (PDF parsing) is a long-running service. Vercel runs functions that live for minutes at most.

## Decision

- The DKG daemon, GROBID and a JSON-RPC proxy for the daemon run on their own host (a VM), their APIs bound to `127.0.0.1`.
- Caddy is the only public HTTP entry: it terminates TLS and requires authentication on every route except `/api/status`, the health check.
- One host serves both environments ([0005](0005-staging-and-production-are-isolated.md)).
- The node's keys and config (`~/.dkg`) are backed up off the host, encrypted: the node's agent address is part of every UAL and context graph id, so losing its keys orphans both graphs.

## Consequences

- Nothing long-running lives on Vercel.
- The host is infrastructure to run, patch and monitor, and a single point of failure for both environments. Its node wallet pays every publish and is alerted on.
- A lost host is rebuilt from the backup, with the same agent address.
- Its setup must be documented, since no code deploys it.
