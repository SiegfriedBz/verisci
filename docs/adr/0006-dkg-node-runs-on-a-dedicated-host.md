# 0006. The DKG node runs on a dedicated host

- Status: Accepted
- Date: 2026-10-02

## Context

A DKG node is a long-lived peer-to-peer daemon, and Vercel runs serverless functions that live for minutes at most. GROBID (PDF parsing) is also a long-running service.

## Decision

- The DKG daemon, GROBID and a JSON-RPC proxy run on their own host (a VM), their HTTP APIs bound to `127.0.0.1`. Caddy is the only public HTTP entry point: it terminates TLS and routes to them. The daemon's peer-to-peer port is opened only as far as its node role requires.
- Every route behind Caddy requires authentication: the daemon's bearer token for the DKG API, and a credential checked by Caddy for GROBID (a secret path alone is not enough). Only `/api/status` is public, for health checks.
- The app (Vercel) and its workflows (Inngest) reach the host over HTTPS; the daemon reaches the chain through the local RPC proxy.
- One host serves both environments ([0004](0004-staging-and-production-are-isolated.md)).
- The node's keys and config (`~/.dkg`) are backed up off the host, encrypted. The node's agent address is part of every UAL and context graph id, so losing its keys orphans both graphs.

## Consequences

- The node keeps its peers and state between requests, and nothing long-running lives on Vercel.
- The host is infrastructure to run, patch and monitor, and a single point of failure for both environments; its node wallet pays every publish and is alerted on like the oracle's ([0011](0011-rating-requests-are-free-on-testnet.md)).
- A lost host is rebuilt from the backup, keeping the same agent address.
- Its setup (config, context graphs, Caddy routes) must be documented, since no code deploys it.
