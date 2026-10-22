# The DKG node server

LabsTrail's DKG node runs on one server, with everything it needs beside it: the DKG daemon,
its RPC proxy ([`infra/rpc-proxy`](../infra/rpc-proxy/README.md)), GROBID, and Caddy, the
only public entry ([ADR 0006](adr/0006-dkg-node-runs-on-a-dedicated-host.md)). Staging,
production and developers' computers all use this one node, each with its own credential
([ADR 0039](adr/0039-one-credential-per-environment.md)).

"The DKG node server", in the repo's docs, is this machine. The node was built on a
developer's computer on 2026-10-09 and moved here on 2026-10-17, keeping its agent address
and its graphs.

This guide says what runs on the server, how to operate it, how it was set up, and how to
rebuild it from the backup. Each step ends with a check: a command and what it should print.
A step marked `to check` was not verified.

## At a glance

| | |
| --- | --- |
| Machine | Oracle Cloud Always Free VM, `VM.Standard.A1.Flex` (ARM `aarch64`), 2 OCPUs, 12 GB, 96 GB disk, region `eu-paris-1`, hostname `verisci-vnc` |
| System | Ubuntu 24.04 LTS, automatic security updates on |
| Public address | `89.168.60.126` |
| Names | `verisci-dkg.duckdns.org` (the DKG node's API) and `verisci-grobid.duckdns.org` (GROBID), both pointing at that address |
| Login | `ssh -i ~/.ssh/id_ed25519_bz ubuntu@89.168.60.126`; `ubuntu` has passwordless `sudo` |
| Node | DKG 10.0.22, role `edge`, agent address `0xD701ed157232ad5E14BC4134a8D10D64D86f13B3` |
| Graphs | `verisci-staging` (registry id 625), `verisci-main-prod` (887, production's) and `verisci-prod` (816, retired) |
| Inbound ports | 22 (SSH), 80 and 443 (Caddy) |

## How the parts connect

Each program listens on `127.0.0.1`, reachable only from the server itself, except the
daemon's peer-to-peer port and Caddy. Caddy is the only door in from the internet.

```text
the app (Vercel, or pnpm dev) ──HTTPS 443, credential──▶ Caddy ──┬──▶ DKG daemon API  127.0.0.1:9200
                                                                 └──▶ GROBID          127.0.0.1:8070

DKG daemon ──JSON-RPC──▶ RPC proxy 127.0.0.1:8545 ──▶ public Base Sepolia endpoints, then Alchemy RPC
DKG daemon ◀──peer-to-peer──▶ other DKG nodes and the testnet relays
```

| Traffic | Path |
| --- | --- |
| The app → the node | `https://verisci-dkg.duckdns.org`, through Caddy, with the environment's credential; the health check's `/api/status` with none |
| The app → GROBID | `https://verisci-grobid.duckdns.org`, through Caddy, with the same credential |
| The node → Base Sepolia (reads, transactions) | Through the RPC proxy only: `chain.rpcUrl` is `http://127.0.0.1:8545` and no backup RPC URL is set |
| The node ↔ other DKG nodes | Directly, on its peer-to-peer port (sync, storage acknowledgements, relays) |
| The RPC proxy → the chain | Directly, to the public endpoints first and Alchemy RPC last |

## What runs

| Program | Address | Run by | Its job |
| --- | --- | --- | --- |
| RPC proxy (`infra/rpc-proxy`) | `127.0.0.1:8545` | `rpc-proxy.service` | Spreads the daemon's chain reads over free public endpoints, with Alchemy RPC as a budgeted fallback |
| DKG daemon 10.0.22, its API | `127.0.0.1:9200` | `dkg.service`, after the proxy | Stores, shares and mints Knowledge Assets; answers SPARQL queries on the graphs |
| The daemon's graph store (Oxigraph 0.5.8, arm64) | `127.0.0.1:7878` | the daemon | Holds the graphs' triples, in `~/.dkg/oxigraph-data` |
| The daemon's peer-to-peer port | all interfaces, a random port (`listenPort: 0`) | the daemon | Talks to other DKG nodes; behind Oracle's firewall they reach it through the testnet relay |
| GROBID `lfoppiano/grobid:0.9.1-crf` | `127.0.0.1:8070` | Docker container `grobid`, `--restart unless-stopped` | Reads a PDF's title, authors, abstract and DOI for the publish run |
| Caddy 2.6.2 | `:80`, `:443` | `caddy.service` | HTTPS for both names (Let's Encrypt certificates, renewed by Caddy), checks the credential, forwards to the daemon or GROBID |
| DuckDNS refresh | | `ubuntu`'s crontab, every 5 minutes | Keeps both names pointing at the server's address (`~/duckdns/duck.sh`) |

The configuration files Caddy and systemd use are in the repo,
[`infra/node-server/`](../infra/node-server/README.md), and the proxy's unit is
[`infra/rpc-proxy/rpc-proxy.service`](../infra/rpc-proxy/rpc-proxy.service).

Measured on 2026-10-17 with everything running: 4.8 GB of the 11 GB of memory in use
(GROBID 3.5 GB, the daemon about 0.7 GB), 18 GB of disk used.

## The two names

`verisci-dkg.duckdns.org` and `verisci-grobid.duckdns.org` are free subdomains from
[DuckDNS](https://www.duckdns.org), both pointing at the server's public address. A cron job
on the server (`~/duckdns/duck.sh`, every 5 minutes) tells DuckDNS the server's current
address, so the names follow it. The script holds the DuckDNS account's token, readable by
`ubuntu` only.

Caddy serves each name as its own site: the first leads to the DKG daemon's API, the second
to GROBID. Each environment's settings name them:

| Setting | Value |
| --- | --- |
| `DKG_URL` | `https://verisci-dkg.duckdns.org` |
| `GROBID_URL` | `https://verisci-grobid.duckdns.org` |

Check:

```bash
dig +short verisci-dkg.duckdns.org verisci-grobid.duckdns.org
# 89.168.60.126, twice
```

### On a new server

The DuckDNS job comes first on a new server: Caddy gets its certificates only once both
names point at it. The token is on the DuckDNS website, signed in with the account that owns
both names, and is typed on the server alone:

```bash
mkdir -p ~/duckdns
read -rs -p 'DuckDNS token: ' T && printf '%s\n' '#!/bin/bash' \
  "echo url=\"https://www.duckdns.org/update?domains=verisci-dkg,verisci-grobid&token=$T&ip=\" | curl -s -o ~/duckdns/duck.log -K -" \
  > ~/duckdns/duck.sh; unset T; chmod 700 ~/duckdns/duck.sh
(crontab -l 2>/dev/null; echo '*/5 * * * * /home/ubuntu/duckdns/duck.sh >/dev/null 2>&1') | crontab -
~/duckdns/duck.sh && cat ~/duckdns/duck.log
# OK
```

An empty `ip=` sets both names to the address the call comes from
([domain](domain.md) → The node server).

## The credentials

Each environment has its own credential, a random 64-character hex string
([ADR 0039](adr/0039-one-credential-per-environment.md)). It opens both sites. Caddy checks it,
then calls the daemon with the daemon's admin token, which no environment holds; GROBID gets
the call without any credential. `/api/status`, the health check, answers without one, and
Caddy passes it on with no token.

| Credential, on the server | Used by | Set there as |
| --- | --- | --- |
| `VERISCI_LOCAL_TOKEN` | Developers' computers | `DKG_TOKEN` in `.env.local` |
| `VERISCI_STAGING_TOKEN` | `develop` and feature previews | `DKG_TOKEN` in Vercel's Preview scope |
| `VERISCI_PRODUCTION_TOKEN` | Production | `DKG_TOKEN` in Vercel's Production scope |

They live in `/etc/caddy/verisci.env` (root, mode 600), with the admin token as
`DKG_ADMIN_TOKEN` ([`infra/node-server/README.md`](../infra/node-server/README.md)).

Show one credential, to copy it into its environment's settings (here the local one; the
others are `VERISCI_STAGING_TOKEN` and `VERISCI_PRODUCTION_TOKEN`):

```bash
ssh -i ~/.ssh/id_ed25519_bz ubuntu@89.168.60.126 'sudo sed -n "s/^VERISCI_LOCAL_TOKEN=//p" /etc/caddy/verisci.env'
```

[The developer's computer](#the-developers-computer) writes the local one into `.env.local`
without showing it.

Revoke or rotate one environment's credential: give it a new value and reload Caddy. The
other environments keep working; the environment whose credential changed needs the new
value in its settings. Caddy refuses to start or reload with a secret left empty.

```bash
sudo sed -i "s/^VERISCI_STAGING_TOKEN=.*/VERISCI_STAGING_TOKEN=$(openssl rand -hex 32)/" /etc/caddy/verisci.env
sudo systemctl reload caddy
```

Check, from any computer:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://verisci-dkg.duckdns.org/api/status      # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://verisci-dkg.duckdns.org/api/query  # 401
curl -s -o /dev/null -w '%{http_code}\n' https://verisci-grobid.duckdns.org/api/isalive    # 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer <credential>" \
  https://verisci-grobid.duckdns.org/api/isalive                                           # 200
```

A wrong credential, an empty one and the admin token itself all get 401.

## Where secrets live

Nothing below is ever committed or pasted into a chat.

| Secret | Where |
| --- | --- |
| Alchemy RPC URL (key included) | Server: `/home/ubuntu/rpc-proxy/env`, mode 600 |
| Node keys and wallets | Server: `~/.dkg` (`agent-key.bin`, `agent-keystore.json`, `wallets.json`, `wallets.key`); the encrypted backups |
| The daemon's admin token | Server: `~/.dkg/auth.token`, `/etc/caddy/verisci.env`, and Caddy's loaded config (behind its admin endpoint, `localhost:2019`, and in `/var/lib/caddy/.config/caddy/autosave.json`); the encrypted key backups |
| The environments' credentials | Server: `/etc/caddy/verisci.env` and Caddy's loaded config; each environment's own settings (`.env.local`, Vercel's scopes) |
| DuckDNS token | Server: `~/duckdns/duck.sh`, mode 700 |
| SSH key | Developer's computer: `~/.ssh/id_ed25519_bz` |
| Backup passphrase | Kept by the maintainer, apart from the backups |
| Encrypted backups | Developer's computer and a USB key: `verisci-dkg-keys-<date>.tar.gz.gpg` (the six files that make the node), `verisci-dkg-moved-2026-10-17.tar.gz.gpg` (its whole folder as it left the developer's computer, graph store included) and `verisci-dkg-old-2026-09.tar.gz.gpg` (the node before 2026-10-09); developer's computer only: `verisci-prototype-node-2026-10-17.tar.gz.gpg` (the prototype's node) |

Caddy's journal also holds the admin token and the credentials of the time, written at each
start until 2026-10-17, when the drop-in stopped it; those credentials were replaced that
day. On the server, `ubuntu` reads every secret: it has passwordless `sudo`, and Caddy's admin
endpoint answers any local process.

## Day to day

Log in:

```bash
ssh -i ~/.ssh/id_ed25519_bz ubuntu@89.168.60.126
```

| To | Run on the server |
| --- | --- |
| See what is running | `systemctl is-active rpc-proxy dkg caddy docker && docker ps` |
| The node's version and graphs | `curl -s 127.0.0.1:9200/api/status \| python3 -m json.tool \| less` |
| The daemon's log | `journalctl -u dkg -f` |
| The proxy's status line (every 30 s) | `journalctl -u rpc-proxy -f \| grep stat` |
| Caddy's log | `journalctl -u caddy -f` |
| GROBID's log | `docker logs -f grobid` |
| Restart one program | `sudo systemctl restart dkg` (or `rpc-proxy`, `caddy`); `docker restart grobid` |
| Stop the daemon | `sudo systemctl stop dkg`; systemd starts it again after a `dkg stop` |

Everything starts by itself when the server boots, the proxy before the daemon. A reboot
(`sudo systemctl reboot`) takes about 25 seconds; the graphs are back at `finalized-chain`
about a minute later.

Every hour, staging's and production's health check reads `/api/status` and alerts the
Telegram chat when the node does not answer within 10 s, or lists the environment's graph
other than `accepted` from `finalized-chain`
([ADR 0038](adr/0038-alerts-go-to-one-telegram-chat.md)).

## The server: Oracle Cloud

The server is an Oracle Cloud Always Free VM, chosen because it costs nothing and fits the
stack. It ran the earlier prototype, `desci-rating-dapp`, from 2026-09; LabsTrail took it over
on 2026-10-17, and the prototype's node was set aside (below).

The Oracle account that owns the VM is locked: its console cannot be reached (lost password,
no reset email, support contacted). The VM keeps running and is managed over SSH
alone. So its firewall rules, its public address and the instance itself cannot be changed,
and a VM Oracle stops cannot be started again. The encrypted backup is the way out: a lost
server means restoring the node on another machine ([If the server is lost](#if-the-server-is-lost)).

The firewall lets in 22, 80 and 443, both in Oracle's rules and in the VM's own `iptables`
rules. The daemon's peer-to-peer port is not opened; as an `edge` node it reaches other nodes
through the testnet relay.

## Setting up the server

The steps followed on 2026-10-17, on a server the prototype had set up. Another machine
starts from Ubuntu 24.04 with SSH, `sudo`, Docker and Caddy (Ubuntu's package) installed, and
the DuckDNS job set up ([On a new server](#on-a-new-server)), then follows them in order,
skipping those marked `this server only` and `one time`.

### 1. Set the previous node aside (this server only)

The prototype's node (DKG 10.0.16) ran here with its own keys, wallets and graphs, none of
which LabsTrail uses. It was stopped and kept:

```bash
sudo systemctl stop dkg && sudo systemctl disable dkg
mv ~/.dkg ~/.dkg.old-2026-10-17
```

Its wallets, in case their testnet funds are wanted one day: admin
`0x296fFe81f75FE721A88B834d83D292dBF1124129`, publishers
`0x38B548Ca70E61055a936EF84C2Ff65B8cca22DD8`, `0xd1B8e99ffDCD0E728dE6B9F3d4314cD908994135`,
`0xfBfE6AFe51547f1A3A0c9c788F4D5a0D72C9a5a2`. An encrypted copy of its `~/.dkg` is on the
developer's computer (`verisci-prototype-node-2026-10-17.tar.gz.gpg`), made from it:

```bash
ssh -i ~/.ssh/id_ed25519_bz ubuntu@89.168.60.126 'tar -C ~ -czf - .dkg.old-2026-10-17' \
  | gpg --symmetric --cipher-algo AES256 -o ~/verisci-prototype-node-2026-10-17.tar.gz.gpg
```

The prototype's other files (its proxy `proxy.js`, its daemon unit and drop-in, its
Caddyfile) are in `~/prototype-2026-10-17`.

Check: `ls -d ~/.dkg*` lists only `~/.dkg.old-2026-10-17`, and `systemctl is-enabled dkg`
prints `disabled`.

### 2. Node.js and the DKG CLI

Node 24.21.0, the repo's version (`.nvmrc`), from NodeSource's `node_24.x` repository, held
at that version so upgrades are deliberate. A new server adds that repository first with
`curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -`; this one had the
prototype's `node_22.x` repository, switched by the first line:

```bash
sudo sed -i 's#node_22.x#node_24.x#' /etc/apt/sources.list.d/nodesource.sources
sudo apt-get update
sudo apt-get install -y --allow-downgrades nodejs=24.21.0-1nodesource1 build-essential
sudo apt-mark hold nodejs
```

The DKG CLI, with the three install scripts it needs (step 3 of [Building a new
node](#building-a-new-node)); on ARM, `better-sqlite3` builds from source, hence
`build-essential`:

```bash
sudo npm install -g --allow-scripts=@origintrail-official/dkg,better-sqlite3,@openuidev/lang-core \
  @origintrail-official/dkg@10.0.22
```

Check: `node --version` prints `v24.21.0`, `dkg --version` prints `10.0.22`.

### 3. Bring the node over

The node's whole folder moves, its graph store included, so the server holds every asset the
node published. On 2026-10-17 it was copied from the developer's computer, where it ran
until then.

Before the move, count what the node holds, on the machine it runs on. The papers count is
the papers list's own query (`paperCountQuery` in `@labstrail/core`); on 2026-10-17 it was 7
papers and 4 ratings. Then stop that node for good: two daemons with the same keys would
share one peer identity and the publisher wallets' nonces.

```bash
dkg stop
```

Copy the folder over SSH, leaving out what the server recreates: the Oxigraph program (built
for the machine it ran on; the daemon downloads the server's build), its lock and owner
files, and the daemon's PID, port and log files:

```bash
tar -C ~ --exclude=.dkg/oxigraph --exclude=.dkg/oxigraph-data/dkg-oxigraph-owner.json \
  --exclude=.dkg/oxigraph-data/LOCK --exclude=.dkg/daemon.pid --exclude=.dkg/daemon.log \
  --exclude=.dkg/api.port -czf - .dkg \
  | ssh -i ~/.ssh/id_ed25519_bz ubuntu@89.168.60.126 'test ! -e ~/.dkg && tar -C ~ -xzf - && chmod 700 ~/.dkg'
```

On the old machine, rename the folder so the node cannot start there by mistake, then keep
it only encrypted, with the backups' passphrase ([step 10](#10-back-up-the-nodes-keys)):

```bash
mv ~/.dkg ~/.dkg.moved-2026-10-17
tar -C ~ -czf - .dkg.moved-2026-10-17 | gpg --symmetric --cipher-algo AES256 -o ~/verisci-dkg-moved-2026-10-17.tar.gz.gpg
gpg -d ~/verisci-dkg-moved-2026-10-17.tar.gz.gpg | tar -tzf - | wc -l   # the folder's entry count
rm -rf ~/.dkg.moved-2026-10-17
```

The graph store written on an x86 computer opens on the ARM server as it is.

Check, once the daemon runs (step 5): the same counts as before the move.

### 4. The RPC proxy

The server runs the repo's proxy source with plain Node ([ADR 0002](adr/0002-internal-packages-ship-typescript-source.md)).
Copy `infra/rpc-proxy/src` (tests left out) and the unit, from the repo root on a developer's
computer:

```bash
tar -C infra/rpc-proxy/src --exclude='*.test.ts' -cf - . \
  | ssh -i ~/.ssh/id_ed25519_bz ubuntu@89.168.60.126 'mkdir -p ~/rpc-proxy/src && tar -C ~/rpc-proxy/src -xf -'
scp -i ~/.ssh/id_ed25519_bz infra/rpc-proxy/rpc-proxy.service ubuntu@89.168.60.126:/tmp/
```

Its settings file holds Alchemy RPC's Base Sepolia URL as `UPSTREAM_RPC`
([`infra/rpc-proxy/README.md`](../infra/rpc-proxy/README.md) → Settings). On 2026-10-17 the
developer's file was copied as it was:

```bash
scp -i ~/.ssh/id_ed25519_bz ~/.config/verisci/rpc-proxy.env ubuntu@89.168.60.126:rpc-proxy/env
```

On the server:

```bash
chmod 600 ~/rpc-proxy/env
sudo install -m 644 /tmp/rpc-proxy.service /etc/systemd/system/rpc-proxy.service
sudo systemctl daemon-reload && sudo systemctl enable --now rpc-proxy
```

Check:

```bash
curl -s 127.0.0.1:8545 -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
# {"jsonrpc":"2.0","id":1,"result":"0x14a34"}
```

### 5. The daemon

Install [`infra/node-server/dkg.service`](../infra/node-server/dkg.service) (copied to `/tmp`
like the proxy's unit) and start it:

```bash
sudo install -m 644 /tmp/dkg.service /etc/systemd/system/dkg.service
sudo systemctl daemon-reload && sudo systemctl enable --now dkg
```

At its first start on ARM the daemon downloads Oxigraph's arm64 build into `~/.dkg/oxigraph`.

Check, after about a minute:

```bash
curl -s 127.0.0.1:9200/api/status | python3 -c "
import json,sys; d=json.load(sys.stdin); print(d['version'], d['nodeRole'])
for g in d['rfc64Catalog']['contextGraphs']: print(g['contextGraphId'], g['authorityState'], g['policySource'])"
# 10.0.22 edge
# 0xD701…/verisci-staging accepted finalized-chain
python3 -c "import json,os; print(json.load(open(os.path.expanduser('~/.dkg/wallets.json')))['wallets'][0]['address'])"
# 0xD701ed157232ad5E14BC4134a8D10D64D86f13B3 (the agent address, unchanged)
```

### 6. GROBID

The CRF image, pinned to a release tag (never `latest`), published for both `amd64` and
`arm64`; Docker restarts it after a reboot:

```bash
docker run -d --name grobid --restart unless-stopped -p 127.0.0.1:8070:8070 lfoppiano/grobid:0.9.1-crf
```

It takes about 25 seconds to start and uses about 3.5 GB of memory.

Check:

```bash
curl -s 127.0.0.1:8070/api/isalive
# true
curl -s -F input=@paper.pdf -H 'Accept: application/xml' 127.0.0.1:8070/api/processHeaderDocument | grep -o '<title[^>]*>[^<]*</title>'
# the paper's title
```

### 7. Caddy and the credentials

Copy [`infra/node-server/Caddyfile`](../infra/node-server/Caddyfile) and
[`caddy-env.conf`](../infra/node-server/caddy-env.conf) to `/tmp`. On the server, write the
secrets file with three new credentials and the daemon's admin token (the second line of
`~/.dkg/auth.token`), then install both files. The drop-in starts Caddy with its config
alone, since Ubuntu's unit adds `--environ`, which writes every secret to the journal, and
stops a start or reload when a secret is empty. This server kept the prototype's Caddyfile
first (`this server only`):

```bash
sudo install -m 600 -o ubuntu -g ubuntu /etc/caddy/Caddyfile ~/prototype-2026-10-17/Caddyfile
```

Then, on any server:

```bash
sudo install -m 600 -o root -g root /dev/null /etc/caddy/verisci.env
printf "VERISCI_LOCAL_TOKEN=%s\nVERISCI_STAGING_TOKEN=%s\nVERISCI_PRODUCTION_TOKEN=%s\nDKG_ADMIN_TOKEN=%s\n" \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(sed -n 2p ~/.dkg/auth.token)" \
  | sudo tee /etc/caddy/verisci.env >/dev/null
sudo install -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile
sudo mkdir -p /etc/systemd/system/caddy.service.d
sudo install -m 644 /tmp/caddy-env.conf /etc/systemd/system/caddy.service.d/verisci.conf
sudo bash -c 'set -a; . /etc/caddy/verisci.env; caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile'
sudo systemctl daemon-reload && sudo systemctl restart caddy
```

`caddy validate` prints `Valid configuration`. Caddy reuses the certificates it already holds
for both names, or gets them from Let's Encrypt on its first request.

Check: the four commands in [The credentials](#the-credentials), each environment's credential
reading the papers count, a PDF parsed through GROBID with a credential, and no secret in
Caddy's journal: `sudo journalctl -u caddy -b | grep -c TOKEN=` prints `0`.

### 8. The production graph (one time)

A rebuilt server skips this step: the graph stays registered on chain, and the key backup's
`config.json` lists it.

Created and registered like `verisci-staging` (step 8 of [Building a new
node](#building-a-new-node)): open access and open publishing, a 100 TRAC deposit from the
agent's wallet, plus gas. Then back up the node's keys ([step 10](#10-back-up-the-nodes-keys)),
since `config.json` changed.

```bash
dkg context-graph create verisci-main-prod --access-policy 0 --save
dkg context-graph register 0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-main-prod
```

| Graph | Full id | Registry id | Use |
| --- | --- | --- | --- |
| `verisci-staging` | `0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging` | 625 | Staging, previews and local development |
| `verisci-main-prod` | `0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-main-prod` | 887 | Production, since 2026-10-19 |
| `verisci-prod` | `0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-prod` | 816 | Retired: OriginTrail's cores keep it dormant (`docs/domain.md` → DKG); it stays in `contextGraphs`, unused |

`verisci-prod` reached `finalized-chain` 10 seconds after registering, on 2026-10-17;
`verisci-main-prod` at once, on 2026-10-19.

Check: `/api/status` lists every graph above at `accepted finalized-chain`, and
`~/.dkg/config.json`'s `contextGraphs` holds their full ids.

### 9. Reboot

```bash
sudo systemctl reboot
```

Check, once SSH answers again: `systemctl is-active rpc-proxy dkg caddy docker` prints
`active` four times, `docker ps` lists `grobid`, every graph is back at `finalized-chain`,
and the checks in [The credentials](#the-credentials) pass.

### 10. Back up the node's keys

After any change to `~/.dkg/config.json` (a graph added) or to the keys, back up the six
files that make the node, off the server, encrypted with the passphrase the maintainer
keeps. From the developer's computer:

```bash
ssh -i ~/.ssh/id_ed25519_bz ubuntu@89.168.60.126 \
  'tar -C ~/.dkg -czf - agent-key.bin agent-keystore.json auth.token config.json wallets.json wallets.key' \
  | gpg --symmetric --cipher-algo AES256 -o ~/verisci-dkg-keys-$(date +%F).tar.gz.gpg
```

Copy the file to the USB key too.

Check:

```bash
gpg -d ~/verisci-dkg-keys-YYYY-MM-DD.tar.gz.gpg 2>/dev/null | tar -tzf - | wc -l
# 6
```

## Updating a program on the server

- **The RPC proxy**, after a change merged in `infra/rpc-proxy`: copy its `src` again (step 4)
  and `sudo systemctl restart rpc-proxy`.
- **The Caddyfile**, after a change in `infra/node-server`: copy it again (step 7),
  `caddy validate`, then `sudo systemctl reload caddy`.
- **Caddy's drop-in or the daemon's unit**, after a change in `infra/node-server`: copy it
  again (step 7 or 5), `sudo systemctl daemon-reload`, then `sudo systemctl restart caddy`
  (or `dkg`).
- **The DKG daemon**: the version is pinned and auto-update is off. An upgrade is deliberate:
  `sudo npm install -g … @origintrail-official/dkg@<version>`, `sudo systemctl restart dkg`,
  and the new version recorded here and in `docs/domain.md`.
- **GROBID**: change the tag in step 6, `docker rm -f grobid`, run it again.
- **Node.js**: held at 24.21.0; follow the repo's `.nvmrc` with `apt-mark unhold`, an install
  at the new version, and `apt-mark hold`.

## If the server is lost

The node lives in its keys: its agent address is part of every UAL it minted and of every
graph id ([ADR 0006](adr/0006-dkg-node-runs-on-a-dedicated-host.md)). Another Ubuntu server
takes over:

1. Stop the old server's daemon and DuckDNS job if it can still be reached
   (`sudo systemctl disable --now dkg`, `crontab -r`): two daemons with the same keys share
   one peer identity and the publisher wallets' nonces, and two DuckDNS jobs move the names
   back and forth. If it cannot be reached, regenerate the token on the DuckDNS website, so
   its job stops moving the names.
2. Set up the DuckDNS job on the new server ([On a new server](#on-a-new-server)).
3. Follow [Setting up the server](#setting-up-the-server) from step 2, without step 8, with the
   latest key backup in place of step 3: decrypt it into `~/.dkg` on the new server.
   ```bash
   mkdir -m 700 ~/.dkg
   gpg -d verisci-dkg-keys-YYYY-MM-DD.tar.gz.gpg | tar -C ~/.dkg -xzf -
   ```
4. The new credentials go into every environment's settings.

`to check`: how much of the graphs' content a node restored from its keys alone syncs back
from the network. The papers and ratings are minted on chain and shared with peers, but the
papers list reads the node's own store.

## The developer's computer

The node runs on the server alone: the local pages, publish runs and rating runs use it,
with the `local` credential in `.env.local`:

```bash
DKG_URL=https://verisci-dkg.duckdns.org
DKG_TOKEN=<VERISCI_LOCAL_TOKEN>
GROBID_URL=https://verisci-grobid.duckdns.org
```

To write the current `local` credential into `.env.local` without showing it, from the
repo's root, then restart `pnpm dev`, which reads `.env.local` when it starts:

```bash
T=$(ssh -i ~/.ssh/id_ed25519_bz ubuntu@89.168.60.126 'sudo sed -n "s/^VERISCI_LOCAL_TOKEN=//p" /etc/caddy/verisci.env') \
  && [ ${#T} -eq 64 ] && sed -i "s/^DKG_TOKEN=.*/DKG_TOKEN=$T/" .env.local; unset T
```

GROBID can also run locally in Docker (step 6, without `--restart`), with
`GROBID_URL=http://127.0.0.1:8070` ([ADR 0006](adr/0006-dkg-node-runs-on-a-dedicated-host.md));
it ignores the credential. The computer that ran the node until 2026-10-17 keeps its folder
only encrypted, as `verisci-dkg-moved-2026-10-17.tar.gz.gpg` (step 3); a node is never
started from it again.

## Building a new node

How the node was built from nothing, on 2026-10-09, on a developer's computer (Ubuntu 24.04,
x86_64). A new node has a new agent address and new graphs, so this is for a fresh start only;
the running node is moved or restored from its backup instead. On a server, the program
setup of steps 2 and 10 is [Setting up the server](#setting-up-the-server)'s.

### 1. Move an existing node aside

`dkg init` writes `~/.dkg`. If one exists from an earlier node, rename it rather than
delete it: its wallet may still hold funds.

```bash
mv ~/.dkg ~/.dkg.old-$(date +%F)
```

Check: `ls -d ~/.dkg*` lists only the renamed folder.

### 2. The RPC proxy

Its settings file holds Alchemy RPC's Base Sepolia URL. Create it empty and readable only by
you, then write the URL with a text editor, so the key never lands in the shell history:

```bash
mkdir -p ~/.config/verisci
install -m 600 /dev/null ~/.config/verisci/rpc-proxy.env
nano ~/.config/verisci/rpc-proxy.env
# one line: UPSTREAM_RPC=https://base-sepolia.g.alchemy.com/v2/<key>
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

### 3. Install the DKG CLI

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

### 4. Create the node

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
| Enable API authentication | `y` | Every API call but `/api/status` needs the admin token, `~/.dkg/auth.token` |

`init` then creates four operational wallets (`~/.dkg/wallets.json`, encrypted with
`wallets.key`) and asks OriginTrail's testnet faucet to fund them. On 2026-10-09 each got
1,000 TRAC but no ETH: the faucet itself had run out of Base Sepolia ETH ("insufficient
funds for intrinsic transaction cost"). `init` prints the wallets it could not fund; step 7
funds them.

Check: `ls ~/.dkg` lists `config.json`, `wallets.json` and `wallets.key`. The agent key and
the admin token are written at the first `dkg start` (step 5).

### 5. Start the node

With the proxy running (step 2), in its own terminal:

```bash
dkg start -f
```

`-f` keeps it in the foreground; Ctrl-C or `dkg stop` stops it. It needs no ETH to start.

Check:

```bash
curl -s 127.0.0.1:9200/api/status | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'], d['nodeRole'], d['networkName'])"
# 10.0.22 edge DKG V10 Base Testnet
ss -ltn | grep -E ':(9200|7878) '
# both on 127.0.0.1 only
```

The first start writes `agent-key.bin`, `agent-keystore.json` and `auth.token` to `~/.dkg`.
`/api/status` answers without the admin token; every other route needs it.

### 6. Back up the node

Right after the first start, before the node owns anything: its agent address is part of
every UAL it mints and of every graph id, so losing these files orphans them
([ADR 0006](adr/0006-dkg-node-runs-on-a-dedicated-host.md)). The backup holds the six files
that make the node; the graph data lives in its store (`~/.dkg/oxigraph-data`).

```bash
tar -C ~/.dkg -czf - agent-key.bin agent-keystore.json auth.token config.json wallets.json wallets.key \
  | gpg --symmetric --cipher-algo AES256 -o ~/verisci-dkg-keys-$(date +%F).tar.gz.gpg
```

`gpg` asks for a passphrase, kept by the maintainer, never next to the file. Copy the `.gpg`
file off the computer (on 2026-10-09: a USB key).

Check:

```bash
gpg -d ~/verisci-dkg-keys-YYYY-MM-DD.tar.gz.gpg 2>/dev/null | tar -tzf - | wc -l
# 6
```

### 7. Fund the node wallets

`~/.dkg/wallets.json` holds an admin wallet and three publisher wallets. The node's agent
address is the first publisher wallet: it owns the graphs. Mints are signed by any of the
three, so each needs ETH and TRAC. Print the addresses (public, no key), and list the three
publisher addresses, comma-separated, in each deployment's `PUBLISHER_ADDRESSES` (a deployment
that serves ratings refuses to start without it), so the hourly health check alerts when one
runs low (`packages/workflows` README → Notifications and alerts):

```bash
python3 -c "import json,os; w=json.load(open(os.path.expanduser('~/.dkg/wallets.json'))); print('admin', w['adminWallet']['address']); [print('publisher', x['address']) for x in w['wallets']]"
```

The running node's: admin `0x0Ab1079eEB344B507FEacfe6f1b09CeC7ae0D373`, publishers
`0xD701ed157232ad5E14BC4134a8D10D64D86f13B3` (the agent),
`0x539c3206E0f983EAA75327DF512567A040dC3482`, `0x743042500355D5562D04AE5922046129Ef747565`.

Each needs Base Sepolia ETH for gas and TRAC for publishing and registering. `init` sent
1,000 TRAC to each (step 4). On 2026-10-09, 0.02 ETH was sent to each from a developer's
MetaMask testnet account (MetaMask on the Base Sepolia network). Public faucets are the
other source, not tried here (`to check`: which still pay out, and how much): the Coinbase
Developer Platform faucet, the Superchain faucet (`console.optimism.io/faucet`), Alchemy's
faucet.

Check, for each address:

```bash
curl -s https://sepolia.base.org -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["0x…","latest"]}'
# a result above 0x0
```

### 8. Create and register `verisci-staging`

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

Check:

```bash
curl -s 127.0.0.1:9200/api/status | python3 -c "
import json,sys; d=json.load(sys.stdin)
for g in d['rfc64Catalog']['contextGraphs']: print(g['contextGraphId'], g['authorityState'], g['policySource'])"
# 0xD701…/verisci-staging accepted finalized-chain
```

Right after a restart the graph shows `resolving` for a short while.

### 9. Publish a test asset

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

### 10. GROBID

The CRF image is published for x86 and ARM (`amd64` and `arm64` on Docker Hub); the full
image is x86 only. Pinned to a release tag, never `latest`:

```bash
docker run -d --rm --name grobid -p 127.0.0.1:8070:8070 lfoppiano/grobid:0.9.1-crf
```

It uses about 3.5 GB of memory. `docker stop grobid` stops it.

Check:

```bash
curl -s 127.0.0.1:8070/api/isalive
# true
```

### Stopping and starting a node started by hand

Stop in reverse order: `dkg stop`, then the proxy (Ctrl-C), and `docker stop grobid`.
Start the proxy first (step 2), then `dkg start -f` (step 5), then GROBID (step 10). The
proxy's status line shows where calls went and why the last one failed
([`infra/rpc-proxy/README.md`](../infra/rpc-proxy/README.md)).
