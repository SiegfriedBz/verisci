# @verisci/rpc-proxy

A small JSON-RPC proxy that runs on the DKG node server, on `127.0.0.1:8545`. The DKG
daemon takes a single `chain.rpcUrl`; this proxy is that URL. It spreads the daemon's Base
Sepolia reads over free public endpoints and keeps Alchemy, the fallback, within
a daily budget.

## Why it exists

Before it accepts a write, the daemon resolves each context graph's policy from chain
history: long `eth_getLogs` ranges plus many `eth_call`s, again and again. Alchemy's free
tier caps `eth_getLogs` at 10 blocks, and public endpoints throttle bursts. On the previous
host, the earlier proxy sent every call except log reads to Alchemy first, with no limit,
and used up the free tier after a few weeks (`docs/domain.md` → DKG).

## What it does

- **Public endpoints first, Alchemy last.** Calls go to `sepolia.base.org` and
  `base-sepolia-rpc.publicnode.com`, the one with more free slots first, then to Alchemy.
- **A paced daily Alchemy budget.** At most `ALCHEMY_DAILY_LIMIT` Alchemy calls per UTC day
  (default 10,000), and at most a 24th of it in any hour, so a burst cannot spend the day's
  budget in minutes. When it is used up, a call the public endpoints cannot answer gets a
  JSON-RPC error.
- **`eth_getLogs` in windows.** A range is cut into 2,000-block windows up to the chain
  head; a missing `fromBlock` or `toBlock` means the head, as in JSON-RPC. A window one
  public endpoint refuses goes to the other (publicnode takes 2,000 blocks,
  `sepolia.base.org` 200); one they both refuse is halved down to 125 blocks, then sent to
  Alchemy in 10-block slices within the budget; the slices stop at the first failure. An
  outage (timeouts,
  5xx, throttling everywhere) fails the request, and the daemon retries it later.
- **Answers from memory.** Log windows more than 64 blocks below the head are kept (20,000
  at most, oldest dropped). The same `eth_call`, `eth_getBlockByNumber` or
  `eth_blockNumber` within 3 s, or arriving together, takes one upstream call;
  `eth_chainId` is kept after its first answer. The head moves forward only, at most
  10,000 blocks at once, so one wrong answer cannot push it ahead.
- **Throttled endpoints rest** for 1.5 s (HTTP 429, rate limits), and transient failures
  (the network, timeouts, any HTTP 5xx) are retried on the next endpoint, as is history an
  endpoint has pruned (publicnode keeps recent blocks only). A refused range
  ("block range limit exceeded", "too many results") is halved instead.
- **Two lanes:** the daemon's quick calls (its head probe times out after about 4 s) have
  their own slots, separate from the log backfill.
- **Always well-formed JSON-RPC**, with the request's `id`, batches included: the daemon
  fails with `BAD_DATA` on anything else.
- **A status line every 30 s** in the log: requests served and failed, then calls and
  failures per endpoint with the last failure's reason (Alchemy's URL never shown), and
  Alchemy's use of its daily budget.

## Settings

Read from the environment; on the server, from the unit's `EnvironmentFile`. The server
runs the proxy with plain Node, so it reads them itself rather than through
`@verisci/env` ([ADR 0004](../../docs/adr/0004-env-variables-per-workspace-one-root-file.md)).

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `UPSTREAM_RPC` | yes | | Alchemy's Base Sepolia URL, key included (`https://`) |
| `PORT` | no | `8545` | Port on `127.0.0.1` |
| `ALCHEMY_DAILY_LIMIT` | no | `10000` | Alchemy calls allowed per UTC day |

A bad setting stops the proxy at start-up with a message naming it, never its value.

## Running it

Node 22.18 or later runs the TypeScript source directly (type stripping): the server needs
only this folder's `src/`. [`rpc-proxy.service`](rpc-proxy.service) is its systemd unit.
The DKG daemon must start after it, or a reboot leaves the daemon without a chain:

```ini
# /etc/systemd/system/dkg.service.d/10-after-rpc-proxy.conf
[Unit]
After=rpc-proxy.service
Wants=rpc-proxy.service
```

```bash
journalctl -u rpc-proxy -f | grep stat    # the status line, every 30 s
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/rpc-proxy test` | Vitest; upstreams and clock are faked |
| `pnpm --filter @verisci/rpc-proxy typecheck` | Typechecks the package |
| `pnpm --filter @verisci/rpc-proxy start` | Runs it locally (needs `UPSTREAM_RPC`) |

## Depends on

Node's standard library only.
