# The DKG node

How to build verisci's DKG node: the DKG daemon, its RPC proxy (`infra/rpc-proxy`) and
GROBID. It runs on the developer's computer for now, started by hand, and moves to a server
later by restoring its backup, so its agent address and graph ids stay the same
([ADR 0006](adr/0006-dkg-node-runs-on-a-dedicated-host.md)).

Built on 2026-10-09 on Ubuntu 24.04 (x86_64). Each step ends with a check: a command and
what it should print. A step marked `to check` was not verified.

## What runs

| Program | Address | Started with |
| --- | --- | --- |
| RPC proxy (`infra/rpc-proxy`) | `127.0.0.1:8545` | `node --env-file` (below) |
| DKG daemon 10.0.22 | `127.0.0.1:9200` | `dkg start -f` |
| GROBID `lfoppiano/grobid:0.9.1-crf` | `127.0.0.1:8070` | `docker run` (below) |

Start the proxy before the daemon: the daemon reads the chain only through it.

## Where secrets live

Nothing below is ever committed or pasted into a chat.

| Secret | Where |
| --- | --- |
| Alchemy URL (key included) | `~/.config/verisci/rpc-proxy.env`, mode 600 |
| Node keys and wallets | `~/.dkg` (`agent-key.bin`, `agent-keystore.json`, `wallets.json`, `wallets.key`) |
| Admin token | `~/.dkg/auth.token` |
| Backup passphrase | The developer's password manager |
| Encrypted backup of `~/.dkg` | `~/verisci-dkg-keys-<date>.tar.gz.gpg`, copied to a USB key |

## 1. Move an existing node aside

`dkg init` writes `~/.dkg`. If one exists from an earlier node, rename it rather than
delete it: its wallet may still hold funds.

```bash
mv ~/.dkg ~/.dkg.old-$(date +%F)
```

Check: `ls -d ~/.dkg*` lists only the renamed folder.

## 2. The RPC proxy

Its settings file holds Alchemy's Base Sepolia URL:

```bash
mkdir -p ~/.config/verisci
printf 'UPSTREAM_RPC=https://base-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY\n' > ~/.config/verisci/rpc-proxy.env
chmod 600 ~/.config/verisci/rpc-proxy.env
```

`PORT` and `ALCHEMY_DAILY_LIMIT` keep their defaults
([`infra/rpc-proxy/README.md`](../infra/rpc-proxy/README.md) → Settings). Start it from
the repo root, in its own terminal:

```bash
node --env-file="$HOME/.config/verisci/rpc-proxy.env" infra/rpc-proxy/src/main.ts
```

Check:

```bash
curl -s 127.0.0.1:8545 -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
# {"jsonrpc":"2.0","id":1,"result":"0x14a34"}
```

A `stat` line follows every 30 s in the proxy's terminal.

## 3. Install the DKG CLI

The CLI is an npm package with three install scripts (its own, `better-sqlite3`'s native
build, `@openuidev/lang-core`). npm 11 skips install scripts unless allowed, and the node
fails without `better-sqlite3`:

```bash
npm install -g --allow-scripts=@origintrail-official/dkg,better-sqlite3,@openuidev/lang-core \
  @origintrail-official/dkg@10.0.22
```

With Node managed by proto, the global `bin` folder is not on `PATH`. Add it once:

```bash
echo 'export PATH="$HOME/.proto/tools/node/24.21.0/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Check: `dkg --version` prints `10.0.22`.

## 4. Create the node

```bash
dkg init --role edge --network testnet --store oxigraph
```

`edge` is the role for a node behind NAT or not always on. The prompts and the answers
used:

| Prompt | Answer | Why |
| --- | --- | --- |
| Node name | `verisci` | |
| Triple store backend | `1` (`oxigraph-server`) | Managed local server, DKG's recommendation; `--store oxigraph` only pre-fills option 2 |
| Relay multiaddr | default | The public testnet relay, needed behind NAT |
| Context graphs to subscribe | empty | `verisci-staging` is created in step 8 |
| API port | `9200` | |
| Enable auto-update | `n` | The version is pinned; upgrades are deliberate and recorded here |
| RPC URL | `http://127.0.0.1:8545` | The proxy |
| Backup RPC URLs | `none` | Public endpoints called directly would bypass the proxy's limits and caches |
| Hub contract address | default (`0xC056e67Da4F51377Ad1B01f50F655fFdcCD809F6`) | OriginTrail's testnet Hub on Base Sepolia |
| Chain ID | default (`base:84532`) | Base Sepolia |
| Enable API authentication | `y` | Every API call needs the admin token, `~/.dkg/auth.token` |

`init` then creates four operational wallets (`~/.dkg/wallets.json`, encrypted with
`wallets.key`) and asks OriginTrail's testnet faucet to fund them. On 2026-10-09 each got
1,000 TRAC but no ETH: the faucet itself had run out of Base Sepolia ETH ("insufficient
funds for intrinsic transaction cost"). `init` prints the wallets it could not fund; step 7
funds them.

Check: `ls ~/.dkg` lists `config.json`, `wallets.json` and `wallets.key`. The agent key and
the admin token are written at the first `dkg start` (step 5).

## 5. Start the node

With the proxy running (step 2), in its own terminal:

```bash
dkg start -f
```

`-f` keeps it in the foreground; Ctrl-C or `dkg stop` stops it. It needs no ETH to start.

Check:

```bash
curl -s 127.0.0.1:9200/api/status | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'], d['nodeRole'], d['networkName'])"
# 10.0.22 edge DKG V10 Base Testnet
```

The first start writes `agent-key.bin`, `agent-keystore.json` and `auth.token` to `~/.dkg`.

## 6. Back up the node

Right after the first start, before the node owns anything: its agent address is part of
every UAL it mints and of every graph id, so losing these files orphans both
([ADR 0006](adr/0006-dkg-node-runs-on-a-dedicated-host.md)). The backup holds the six files
that make the node; the graph data syncs again from the network.

```bash
tar -C ~/.dkg -czf - agent-key.bin agent-keystore.json auth.token config.json wallets.json wallets.key \
  | gpg --symmetric --cipher-algo AES256 -o ~/verisci-dkg-keys-$(date +%F).tar.gz.gpg
```

`gpg` asks for a passphrase, kept in the developer's password manager, never next to the
file. Copy the `.gpg` file off the computer (on 2026-10-09: a USB key). Restoring it on a
server is tested when the node moves there.

Check:

```bash
gpg -d ~/verisci-dkg-keys-YYYY-MM-DD.tar.gz.gpg 2>/dev/null | tar -tzf - | wc -l
# 6
```

## 7. Fund the node wallets

`~/.dkg/wallets.json` holds an admin wallet and three publisher wallets. The node's agent
address is the first publisher wallet: it signs publishes and owns the graphs. Print the
addresses (public, no key):

```bash
python3 -c "import json,os; w=json.load(open(os.path.expanduser('~/.dkg/wallets.json'))); print('admin', w['adminWallet']['address']); [print('publisher', x['address']) for x in w['wallets']]"
```

Each needs Base Sepolia ETH for gas and TRAC for publishing and registering. `init` sent
1,000 TRAC to each (step 4). On 2026-10-09, 0.02 ETH was sent to each from a developer's
MetaMask testnet account (MetaMask on the Base Sepolia network). Faucets also work: the
Coinbase Developer Platform faucet, the Superchain faucet (`console.optimism.io/faucet`),
Alchemy's faucet (`to check`: which still pay out, and how much).

Check, for each address:

```bash
curl -s https://sepolia.base.org -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["0x…","latest"]}'
# a result above 0x0
```

## 8. Create and register `verisci-staging`

Creating is free and local; registering writes the graph on chain. A bare name is prefixed
with the agent address; `--save` adds the full id to `contextGraphs` in
`~/.dkg/config.json`, so the node serves it again after a restart.

```bash
dkg context-graph create verisci-staging --access-policy 0 --save
dkg context-graph register <agent address>/verisci-staging
```

Open access (`0`) and the registration defaults (open publishing): any node may add its
own assets to the graph, and only an asset's owner can update it. Registering takes a
deposit of 100 TRAC from the agent's wallet, which the CLI approves first, plus gas.

On 2026-10-09 the create returned within seconds, and the graph reached
`finalized-chain` right after registering, and about a minute after a restart.

| Graph | Full id | Registry id |
| --- | --- | --- |
| `verisci-staging` | `0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging` | 625 |

Check:

```bash
curl -s 127.0.0.1:9200/api/status | python3 -c "
import json,sys; d=json.load(sys.stdin)
for g in d['rfc64Catalog']['contextGraphs']: print(g['contextGraphId'], g['authorityState'], g['policySource'])"
# 0xD701…/verisci-staging accepted finalized-chain
```

Right after a restart the graph shows `resolving` for a short while.

## 9. Publish a test asset

A Knowledge Asset goes through working memory (a draft), is sealed, shared with peers, then
minted on chain. `ka create … --share` does the first three in one call, `ka publish` the
mint:

```bash
CG=0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging
dkg ka create smoke-test-YYYY-MM-DD -c $CG \
  --subject urn:verisci:smoke-test --predicate http://schema.org/name --object '"node smoke test"' --share
dkg ka publish smoke-test-YYYY-MM-DD -c $CG --json
```

Test names start with `smoke-test-`, never with `verisci-`, the prefix of the names our code
computes (`packages/core/README.md` → Asset names).

Check: `publish` prints `"status": "confirmed"` and a UAL whose middle segment is the agent
address, and `dkg ka status smoke-test-YYYY-MM-DD -c $CG` shows `"state": "published"`. On
2026-10-09: `did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/0`, minted in
12 s.

## 10. GROBID

The CRF image runs on x86 and ARM alike; the full image is x86 only. Pinned to a release
tag, never `latest`:

```bash
docker run -d --rm --name grobid -p 127.0.0.1:8070:8070 lfoppiano/grobid:0.9.1-crf
```

It uses about 4 GB of memory. `docker stop grobid` stops it.

Check:

```bash
curl -s 127.0.0.1:8070/api/isalive
# true
curl -s -F input=@paper.pdf 127.0.0.1:8070/api/processHeaderDocument | grep -o '<title[^>]*>[^<]*</title>'
# the paper's title
```

## Stopping and starting again

Stop in reverse order: `dkg stop`, then the proxy (Ctrl-C), and `docker stop grobid`.
Start the proxy first (step 2), then `dkg start -f` (step 5), then GROBID (step 10). The
proxy's status line shows where calls went and why the last one failed
([`infra/rpc-proxy/README.md`](../infra/rpc-proxy/README.md)).
