# 0016. Node host topology

- Status: Accepted
- Date: 2026-10-02

## Context

A DKG node is a long-lived peer-to-peer daemon, and Vercel runs serverless functions that live for minutes at most. GROBID (PDF parsing) is also a long-running service.

## Decision

- The DKG daemon, GROBID and a JSON-RPC proxy run on their own host (a VM), each bound to `127.0.0.1`. Caddy is the only public process: it terminates TLS and routes to them.
- The app (Vercel) and its workflows (Inngest) reach the host over HTTPS; the daemon reaches the chain through the local RPC proxy.
- One host serves both environments ([0008](0008-environment-isolation.md)).

## Consequences

- The node keeps its peers and state between requests, and nothing long-running lives on Vercel.
- The host is infrastructure to run, patch and monitor, and a single point of failure for both environments.
- Its setup (config, context graphs, Caddy routes) must be documented, since no code deploys it.
