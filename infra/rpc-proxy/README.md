# @verisci/rpc-proxy

A small JSON-RPC proxy that runs on the DKG node server, on `127.0.0.1:8545`. The DKG
daemon takes a single `chain.rpcUrl`; this proxy is that URL, and spreads the daemon's
Base Sepolia reads over free public endpoints and Alchemy without exhausting Alchemy's
free tier.

## Why it exists

Before it accepts a write, the daemon resolves each context graph's policy from chain
history: long `eth_getLogs` ranges plus many `eth_call`s, again and again. Alchemy's free
tier caps `eth_getLogs` at 10 blocks, and public endpoints throttle bursts. On the previous
host, the daemon sent 60 to 80 million requests a day; the earlier proxy sent every call
to Alchemy first, with no limit, and used up the free tier in about three weeks
(`docs/domain.md` → DKG).

## What it does

- **Public endpoints first, Alchemy last.** Every call goes to `sepolia.base.org`, then
  `base-sepolia-rpc.publicnode.com`, then Alchemy.
- **A daily Alchemy budget.** At most `ALCHEMY_DAILY_LIMIT` Alchemy calls per UTC day
  (default 20,000). Once it is used up, Alchemy rests until midnight UTC, and a call no
  public endpoint can answer gets a JSON-RPC error.
- **`eth_getLogs` in windows.** A range is cut into 2,000-block windows for the public
  endpoints, never past the chain head. A window they refuse is halved down to 250 blocks;
  below that it goes to Alchemy in 10-block slices, within the budget.
- **Answers from memory.** Log windows more than 64 blocks below the head are kept (20,000
  at most, oldest dropped). The same `eth_call`, `eth_getBlockByNumber` or
  `eth_blockNumber` within 3 s is answered from memory, and `eth_chainId` after its first
  answer.
- **Throttled endpoints rest** for 1.5 s, and transient failures are retried.
- **Two lanes:** the daemon's quick calls (its head probe times out after about 4 s) have
  their own slots and never wait behind the log backfill.
- **Always well-formed JSON-RPC**, with the request's `id`, batches included: the daemon
  fails with `BAD_DATA` on anything else.
- **A status line every 30 s** in the log: requests served and failed, then calls and
  failures per endpoint, and Alchemy's use of its budget.

## Settings

Read from the environment; on the server, from the unit's `EnvironmentFile`. The proxy
runs with plain Node, so it reads them itself instead of through `@verisci/env`
([ADR 0004](../../docs/adr/0004-env-variables-per-workspace-one-root-file.md)).

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `UPSTREAM_RPC` | yes | | Alchemy's Base Sepolia URL, key included (`https://`) |
| `PORT` | no | `8545` | Port on `127.0.0.1` |
| `ALCHEMY_DAILY_LIMIT` | no | `20000` | Alchemy calls allowed per UTC day |

A bad setting stops the proxy at start-up with a message naming it, never its value.

## Running it

Node 22.18 or later runs the TypeScript source directly (type stripping), so the server
needs only this folder's `src/` and no install. [`rpc-proxy.service`](rpc-proxy.service)
is the systemd unit; the DKG daemon's unit starts after it (`docs/node-host.md`).

```bash
journalctl -u rpc-proxy -f | grep stat    # the status line, every 30 s
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/rpc-proxy test` | Vitest; upstreams and clock are faked, no network |
| `pnpm --filter @verisci/rpc-proxy typecheck` | Typechecks the package |
| `pnpm --filter @verisci/rpc-proxy start` | Runs it locally (needs `UPSTREAM_RPC`) |

## Depends on

No other workspace, and no runtime dependency.
