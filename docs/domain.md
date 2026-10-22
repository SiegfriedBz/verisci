# Domain facts

Hard-won facts about the systems LabsTrail runs on, each written once so plans cite them
instead of rediscovering them. Decisions built on them are in [`docs/adr/`](adr/README.md).

Many facts were observed in the earlier prototype, `desci-rating-dapp`; the DKG facts marked
10.0.22 were re-checked on this repo's own node. Each section names the versions they were seen on:
when a version moves, re-check the facts before relying on them. Add a fact when you learn
one the hard way.

## DKG

Observed on OriginTrail V10 nodes (`10.0.16`, then `10.0.22` from 2026-10-09; `nodeRole:
edge`, testnet), Base Sepolia.

- **A UAL has two shapes on V10,** chosen by the on-chain id (OriginTrail/dkg
  `packages/core/src/ka-ual-identity.ts`, checked at `abfd785`, 2026-09):
  - `did:dkg:base:{chainId}/{authorAddress}/{kaNumber}`: the V10 form. The author is the
    publishing agent's wallet, packed into the id's high 160 bits. The prototype's UALs
    had the node's agent address, which has no contract code, as their middle segment.
  - `did:dkg:base:{chainId}/{DKGKnowledgeAssets address}/{kaId}`: the older form, for ids
    with no author bits. OriginTrail's docs still show only this one.

  A UAL parser accepts both and never assumes the middle segment is our node: a rating
  request may name either, and the rating run rates only our node's papers
  ([ADR 0011](adr/0011-a-rating-is-a-separate-r-ka.md)).
- **Canonical UAL spelling** (OriginTrail/dkg `packages/core/src/ka-ual-identity.ts`,
  checked at `74a515e`, 2026-10-06): lowercase address and chain namespace, decimal numbers
  with no leading zero; the chain part may be namespaced with several colons, and the chain
  number goes up to uint256. Id `0` is a valid canonical id there. Our parser keeps these
  rules but caps the chain number at `Number.MAX_SAFE_INTEGER`
  ([ADR 0031](adr/0031-uals-are-normalized-before-the-contract.md)).
- **Context graph ids** are the full `<agent address>/<name>`. A bare name refers to a
  different, local graph, so queries with it silently return nothing (`POST /api/query`
  with `verisci-staging` returned no rows on 10.0.22, 2026-10-09).
- **A context graph id is case-sensitive in queries** (10.0.22, 2026-10-10): with the
  address in lowercase in `contextGraphId` and in the query, `/api/query` answered 200 with
  no rows, reading another, empty graph; a `GRAPH` IRI spelled in another case than
  `contextGraphId` answered 400 "Scoped query violation". The node spells the address in
  its EIP-55 checksum form (`0xD701…13B3`).
- **Asset names are scoped per context graph and per writing agent** (OriginTrail/dkg,
  checked at `74a515e`, 2026-10-07): a name is stored at
  `did:dkg:context-graph:<graph id>/assertion/<agent address>/<name>`
  (`packages/core/src/constants.ts`), so the same name in two graphs is two assets.
- **Asset name rules** (`validateAssertionName`, same file and commit): 1 to 256
  characters, no `/`, no whitespace and none of `<>"{}|^` `` ` `` `\`. A path segment
  starting with `did:dkg:` or matching `0x<40 hex>:<number>` is read as a KA id
  (`packages/cli/src/daemon/routes/knowledge-assets.ts`). Ours start with `verisci-`
  (`packages/core/README.md` → Asset names).
- **Publishing a KA is three calls on 10.0.22** (spike, 2026-10-09; all under
  `/api/knowledge-assets`, with `contextGraphId` in the body):
  1. `POST /api/knowledge-assets` with `name` and `quads` writes and seals a working-memory
     draft (`status: wm-sealed`) and reserves its UAL (`kaUal`); it shares only with
     `alsoShareSwm: true`.
  2. `POST …/{name}/swm/share` copies it to shared memory (under 2 s).
  3. `POST …/{name}/vm/publish` mints it: it returns `status: confirmed`, the `ual` and
     the `txHash`.

  Quads are `{ subject, predicate, object }` objects: IRIs bare, literals quoted
  (`"\"7\""`).
- **Read an asset's state with `GET …/{name}?contextGraphId=…`:** `state` is `created`
  (sealed draft, layer `WM`), `promoted` (shared, `SWM`) or `published` (minted, `VM`, with
  `publishedUal`); a name never stored answers 404. So does a graph the node does not
  serve, with the same body (`No knowledge asset "<name>" in context graph "<id>"`, no
  `code`), so only `GET /api/context-graph/list` tells them apart: it lists each graph's
  `id` and `subscribed` (10.0.22, 2026-10-09). Error bodies are `{ error, code }`. `reservedUal` is set from the first
  call, so a UAL being present does not mean minted: read `state`
  ([ADR 0007](adr/0007-all-writes-converge.md)). `GET …/{name}/wm/quads` returns the
  draft's quads.
- **`/api/query` with `contextGraphId` and no `view` reads minted content only** (10.0.22,
  read in the daemon's `dkg-query/dist/dkg-query-engine.js`, 2026-10-10): the graph's data
  graph and its per-asset verifiable-memory graphs (`…/_verifiable_memory/<author>/<n>`).
  Shared memory is read only with `includeSharedMemory: true`.
- **A query naming an asset graph that does not exist is refused, not empty** (10.0.22, local
  node, 2026-10-11): `GRAPH <…/_verifiable_memory/<agent>/999>` answers 400 "Scoped query
  violation: GRAPH <…> is outside the allowed graph set". To ask whether an asset exists,
  query `_meta` instead (`publishedPaperQuery`), which answers 200 with no rows.
- **A graph's `_meta` graph indexes its assets** (10.0.22, 2026-10-10), and a query scoped to
  the graph can read it as `GRAPH <did:dkg:context-graph:<graph id>/_meta>`. With `dkg:` for
  `http://dkg.io/ontology/`:
  - each asset name, at `did:dkg:context-graph:<graph id>/assertion/<agent address>/<name>`,
    has `dkg:memoryLayer` (`"VM"` once minted), `dkg:kaUal`, `dkg:publishedAtBlock`,
    `dkg:publishedAtTx` (the mint's transaction) and `dkg:assertionFinalizedAt` (when it was
    sealed);
  - each UAL has `dkg:publishedAt`, the mint's date-time.
- **A query that mixes `GRAPH <…/_meta>` with default-graph patterns returns no rows**
  (10.0.22, 2026-10-10): the content patterns go in `GRAPH ?g { … }`, which binds the data or
  verifiable-memory graph. `ORDER BY`, `LIMIT`/`OFFSET`, `COUNT(DISTINCT …)`, `GROUP BY`,
  subqueries, `VALUES` and `BIND(IRI(CONCAT(…)))` work; an offset past the end answers 200
  with no rows. The papers list relies on these (`packages/core` → Target KAs).
- **Each minted asset's triples sit in a graph of their own** (10.0.22, 2026-10-10):
  `did:dkg:context-graph:<graph id>/_verifiable_memory/<address>/<number>`, from the UAL's
  lowercase address and number, while its `_meta` path,
  `…/assertion/<agent address>/<name>`, keeps the graph id's EIP-55 spelling. Another node
  may add assets to an open graph (`docs/node-host.md`), and a query reads every author's
  graphs, so our reads keep to assets under our agent and read each from its own graph.
- **How the node lets a query name `?g`** (10.0.22, 2026-10-10): `FILTER(STR(?g) = …)` after
  the `GRAPH ?g` block and a top-level `VALUES (?x ?g) { … }` work; a `BIND(… AS ?g)` before
  the block answers 400 (`expected OPTIONAL`), and a `GRAPH ?g` inside a subquery answers
  400 "Scoped query violation: GRAPH variables inside nested SELECT subqueries cannot be
  constrained safely". `GRAPH <iri> { … }` naming one asset's graph works on its own.
- **A KA passes through three memory layers on 10.0.22:** a working-memory draft (`wm`:
  create, write, finalize), shared memory (`swm/share`, acknowledged by peers), then
  verifiable memory (`vm/publish`, the mint). `dkg ka create --share` runs the first two
  in one call.
- **Repeated writes are refused, with the first content kept** (spike, 2026-10-09):
  - storing a sealed name again answers 409 `KA_ASSERTION_ALREADY_FINALIZED` and keeps
    the first quads;
  - storing a minted name answers 409 `KA_WM_LIFECYCLE_REQUIRED`;
  - minting a name that is not shared, or is already minted, answers 409
    `PUBLISH_NOT_FULL_SHARE` for both, so only the state tells them apart.

  Each 409 is final: retrying it changes nothing, so the caller reads the state and goes
  on from there ([ADR 0007](adr/0007-all-writes-converge.md)).
- **A KA's id is fixed when it is sealed, so it is minted at most once** (spike,
  2026-10-09, run twice):
  - a second `vm/publish` sent 2 s into a running mint failed at gas estimation with
    `KaIdAlreadyMinted`, and the daemon answered 500 after 17 s;
  - three `vm/publish` calls sent at once were spread over the three publisher wallets
    in `~/.dkg/wallets.json`. One mint succeeded. A second reached the chain and
    reverted, still paying its gas. The third sent only a TRAC approval.

  So a 500 from `vm/publish` does not mean the asset is unminted: the caller reads the
  state before any retry. During a mint the state still reads `promoted`, so a poll
  cannot tell a mint in flight from none
  ([ADR 0008](adr/0008-mints-are-async-polled-in-short-steps.md)).
- **Mints outlive the client:** a `vm/publish` whose client disconnected after 2 s was
  minted anyway, its state reading `published` 13 to 16 s later (10.0.22, 2026-10-09,
  run twice; also seen on 10.0.16).
- **`vm/publish-async` needs the async publisher** (10.0.22, 2026-10-09). On our node,
  set up by `dkg init`, the route answers 503 `async_publisher_unavailable`
  (`publisher_disabled`, `retryable: false`). Read in the daemon source (10.0.22), not
  run: `dkg publisher enable` turns it on, and it starts only with at least one
  async-publisher wallet, added with `dkg publisher wallet add <private-key>` to
  `~/.dkg/publisher-wallets.json`, a file apart from `wallets.json`; jobs are read at
  `GET /api/publisher/job?id=…`. Whether one of the node's three publisher wallets can
  serve as that wallet is not checked
  ([ADR 0008](adr/0008-mints-are-async-polled-in-short-steps.md)).
- **Our node reads KAs from other nodes' context graphs** (spike, 2026-10-09):
  - `POST /api/context-graph/fetch-assets` on a graph the node is not subscribed to
    answers 404 ("does not exist or is not subscribed locally");
  - after `POST /api/context-graph/subscribe` with `syncMode: "on-demand"`, the same call
    with the graph id and the UALs (1 to 10 per call, per the daemon source) fetched the
    previous LabsTrail node's KAs 0 to 3, in 22 to 24 s per call, with that node off (so other
    peers presumably hold copies);
  - `/api/query` then read their triples.

  The graph id must be known: a UAL alone does not name its graph. Not checked: whether
  an on-demand subscription survives a restart, or must be listed in `config.json` like
  the node's own graphs ([ADR 0011](adr/0011-a-rating-is-a-separate-r-ka.md)).
- **Mint time varies from about 5 s to over 300 s** (13 to 17 s in the spike, 2026-10-09).
  A mint can also fail fast on quorum (`storage_ack_insufficient`,
  `CORE_TEMPORARILY_UNAVAILABLE`); retrying after a couple of minutes usually works
  ([ADR 0009](adr/0009-retries-are-spaced-with-step-sleep.md)). The DKG client answers it
  `retry-later`, and a publish run whose last attempt meets it stops `network-refused`.
- **A context graph can wait for the cores' activation slots, or stay dormant** (production's
  `verisci-prod`, 2026-10-18): the cores declined the mint of every attempt of its first
  publish run (`storage_ack_insufficient`, `CORE_TEMPORARILY_UNAVAILABLE … not active yet
  (activationCap)`). Read in the daemon's source (10.0.22, `dkg-agent-lifecycle.js`,
  `dkg-agent-vm-promotion.js`): a core activates at most 64 subscriptions to graphs it does
  not host when it starts (`maxRehydratedContextGraphSubscriptions`), keeps the rest dormant,
  and fills freed slots every 30 s; for 10 minutes after its first decline it answers
  "temporarily unavailable" and asks its activator for a slot, then calls the subscription
  dormant. Publishing the same PDF again later picks up where it stopped. `verisci-prod` was
  still dormant on 2026-10-19, with no answer from OriginTrail on
  [OriginTrail/dkg#3357](https://github.com/OriginTrail/dkg/issues/3357), where another
  publisher's older graph stayed dormant while a newly registered one published at once. A
  new graph did the same here: `verisci-main-prod`, registered on 2026-10-19 (registry id
  887), minted in its first publish run, and production moved to it
  ([ADR 0005](adr/0005-staging-and-production-are-isolated.md)).
- **The daemon has a single admin token:** one bearer token in `~/.dkg/auth.token`
  (written by `dkg init` on 10.0.16; on 10.0.22, 2026-10-09, by the first `dkg start`,
  with the agent key), valid for every graph on the node; there are no tokens scoped per
  graph, so whoever holds it can write every environment's graph ([ADR 0005](adr/0005-staging-and-production-are-isolated.md)).
  On 10.0.22 the file starts with a comment line; the token is its second line.
- **`/api/status` answers without the admin token** (10.0.22, 2026-10-17); every other route
  needs it. Its answer is the same with or without the token (same fields, same size). The
  node server's Caddy leaves it open as the health check and forwards it with no token
  ([ADR 0039](adr/0039-one-credential-per-environment.md)).
- **Every context graph must be listed** under `contextGraphs` in the node's
  `~/.dkg/config.json`, or the node stops serving it after a restart.
- **A node's folder moves between machines and architectures** (10.0.22, 2026-10-17): the
  whole `~/.dkg`, copied from an x86_64 computer to an ARM (`aarch64`) server, started with
  the same agent address, peers and graphs, and its Oxigraph store listed the same papers,
  ratings and other assets. Left out of the copy: `oxigraph/`, the Oxigraph program built for
  the old machine, which the daemon downloads again for the new one (`oxigraph-v0.5.8`, an
  arm64 build), and the runtime files (`oxigraph-data/LOCK`,
  `oxigraph-data/dkg-oxigraph-owner.json` with the old PIDs and program path, `daemon.pid`,
  `api.port`, `daemon.log`). Two daemons with the same keys would share one peer identity and
  the publisher wallets' nonces, so the old one stays stopped (`docs/node-host.md`).
- **DKG 10.0.22 runs on ARM** (Ubuntu 24.04 `aarch64`, Node 24.21.0, 2026-10-17):
  `better-sqlite3` builds from source during the global npm install, which needs
  `build-essential`.
- **A new graph reports `authority-resolution-failed` for up to about 20 minutes** (10.0.16).
  That is a slow chain read, not a bad registration: wait before re-registering. On
  10.0.22 (2026-10-09), `verisci-staging` reached `finalized-chain` right after
  registering, and about a minute after a restart; on 2026-10-17, `verisci-prod` 10 s after
  registering.
- **Registering a context graph takes a 100 TRAC deposit** from the agent's wallet, plus
  gas (10.0.22, 2026-10-09). The CLI approves the deposit after decoding the contract's
  revert data, so an RPC path that drops a JSON-RPC error's `data` breaks registering.
- **The node's agent address is its first publisher wallet** (`wallets` in
  `~/.dkg/wallets.json`), not its admin wallet (10.0.22, 2026-10-09).
- **`dkg init` funds the node from OriginTrail's testnet faucet** (10.0.22): on
  2026-10-09 each wallet got 1,000 TRAC but no ETH, because the faucet had run out of ETH.
- **A KA keeps its UAL across updates** (OriginTrail/dkg
  `packages/evm-module/docs/greenfield-ka-ual.md`): the KA is minted to its author as an
  ERC-721 token, and each update adds a new immutable version under the same token. Only
  the owner (the token holder) can update it. On 10.0.22 (spike, 2026-10-09):
  - an update is `POST …/{name}/wm/pull-from` with `layer: "vm"`, which reopens a draft
    seeded with the minted quads;
  - `wm/write` then adds quads (it only appends; the spike found no call that removes
    one, so a later version still carries the earlier version's triples);
  - then `wm/finalize`, `swm/share` and `vm/publish`.

  The UAL and the KA id stayed the same and `assertionVersion` went to 2. A query then
  returns the latest version only ([ADR 0012](adr/0012-three-phases-settled-by-the-oracle.md)).
- **OriginTrail's contracts on Base Sepolia** (read from our node's mint of asset 8, tx
  `0x37d315a0…0896`, 2026-10-10, by its receipt and each contract's `name()`):
  `DKGKnowledgeAssets` (symbol DKA, ERC-721) `0x2b2e1bcb7c52a1587264e01f6b53782d791e6fa0`, whose
  `Transfer` minted the token to the node's agent address; `KnowledgeAssetsLifecycle`
  `0x835f921a0fc8d6365c34a0bb9b37d10c98c1b8c3`, the contract the node's transaction calls; and
  the fee token "V9 Test TRAC" `0x2a58bdd13176d85906d804cdbffa0d9119282dc8` (symbol `v9TRAC`, 18
  decimals; OriginTrail's contract list names it as the V10 testnet's TRAC, and the agent wallet
  held 900 of it on 2026-10-16), whose balance the health check watches. A V10 UAL's token
  id is the author's address shifted left 96 bits, OR the asset number (asset 8's id equals the
  `batchId` the daemon logs). Basescan shows a token at `/nft/<contract>/<token id>`. Recorded
  in `@labstrail/core` as `ORIGINTRAIL_CONTRACTS`; re-check after an OriginTrail upgrade.
- **A KA's content is committed on chain by a merkle root** (OriginTrail's `dkg` repository
  README, 2026-10-10: "a set of RDF statements committed by a Merkle root anchored to the
  blockchain"; each published version is bound to its on-chain commitment). The ERC-721 is
  minted to the author, and the UAL stays the same across updates
  (docs.origintrail.io → Knowledge Assets).
- **KA numbers are counted per author** and reserved at store time (the `reservedUal`).
  All our graphs publish as one author, and a stored asset that is never minted keeps
  its number, so each environment sees gaps in its numbering. Expected, not a bug.
- **Authority resolution needs the node's local JSON-RPC proxy:** public Base Sepolia
  endpoints are not reliable enough for it.
- **Public Base Sepolia endpoints' log limits** (2026-10-09): `sepolia.base.org` answers
  `eth_getLogs` over at most 200 blocks; `base-sepolia-rpc.publicnode.com` over 2,000, but
  keeps history from block 46,500,000 only ("pruned history unavailable").
- **The daemon reads the chain constantly** (the prototype's node, on the node server, DKG
  10.0.16, two graphs, 2026-09 to 2026-10): it re-resolves each graph's authority from chain
  history again and again. With every call except log reads sent to Alchemy RPC first and no
  limit, Alchemy RPC's free tier was used up after a few weeks; from about 2026-10-05 the
  chain head froze and every write failed, while `/api/status` still answered. The proxy now
  keeps Alchemy RPC last, within a daily budget (`infra/rpc-proxy`). Unverified: whether a
  later release reads less.

## The node server

Observed on the Oracle Cloud VM that runs the node (`docs/node-host.md`), 2026-10-17.

- **The stack fits the Always Free ARM shape** (`VM.Standard.A1.Flex`, 2 OCPUs, 12 GB): with
  the daemon, its RPC proxy, GROBID and Caddy running, 4.8 GB of the 11 GB the system sees
  were in use (GROBID 3.5 GB, the daemon about 0.7 GB).
- **A VM keeps running while its Oracle account is locked,** and is reachable over SSH, but
  nothing about it can be changed from Oracle's side: firewall rules, its public address, a
  stop or a start. A reboot from inside the VM works: on 2026-10-17 it came back in 24 s, on
  the kernel unattended upgrades had installed (6.17 → 7.0).
- **Oracle's Ubuntu image filters inbound traffic in `iptables`** besides Oracle's own rules;
  the VM accepts 22, 80 and 443, and the DKG daemon's peer-to-peer port is closed from
  outside. An `edge` node works behind it through the testnet relay.
- **Caddy 2.6.2 reads `{$NAME}` placeholders from its environment when it loads the
  Caddyfile,** so systemd's `EnvironmentFile` is read again on each `systemctl reload caddy`. A
  variable missing from the environment becomes an empty string: the credential check guards
  against it (`"{$NAME}" != ""`), so an empty credential opens nothing. `header_up
  -Authorization` drops the header before GROBID.
- **Ubuntu's `caddy.service` starts Caddy with `--environ`** (2.6.2), which writes every
  environment variable, the `EnvironmentFile`'s secrets included, to the journal at each start.
  The node server's drop-in starts it with its config alone; the credentials logged until then
  were replaced on 2026-10-17.
- **Caddy's `path` matcher compares a cleaned-up path** (lower-cased, `..` resolved, escapes
  decoded), while `reverse_proxy` forwards the path as the client sent it: a route opened by a
  path matcher can receive other raw paths.
- **Caddy keeps its loaded config, `{$NAME}` values filled in,** behind its admin endpoint
  (`localhost:2019`, open to any process on the server) and in `autosave.json`
  (`/var/lib/caddy/.config/caddy/`, the `caddy` user's, mode 600).
- **The DuckDNS update sets a name to the caller's address** when `ip=` is empty: the cron job
  on the server keeps both names on the server's address.

## IPFS

CID facts checked with `multiformats` 14.0.5, 2026-10-07; import defaults from the Kubo
docs, current at 2026-10-07; Pinata's from its v3 API docs, current at 2026-10-09.

- **One file has several CIDs, depending on the import settings:** CID version, raw
  leaves or UnixFS leaves, and the chunker. Kubo's default gives a CIDv0 (`Qm…`, dag-pb);
  with CIDv1 and raw leaves, a file that fits in one chunk gives a `bafkrei…` CID (raw
  codec), and a larger file a `bafybei…` CID (dag-pb root). The uploader picks the
  settings, so one PDF keeps one CID only while every upload goes through the same
  uploader with the same settings ([ADR 0010](adr/0010-pdf-to-target-ka-pipeline.md)).
- **One CID has several spellings:** CIDv0 (`Qm…`) and CIDv1 in base32 (`b…`), base58btc
  (`z…`) or base36 (`k…`). `CID.parse` reads all four, and `.toV1().toString()` writes
  base32. It refuses uppercase base32 (`B…`).
- **A valid CID can name any hash and any size:** `CID.parse` checks the format only. An
  identity-hash CID carries its data inline, so it can be hundreds of characters long.
- **Pinata's v3 upload (`POST https://uploads.pinata.cloud/v3/files`) takes a
  `cid_version`:** `v1` (the default) gives a CIDv1 with raw leaves, 256 KiB chunks and up
  to 174 links per node; `v0` a CIDv0 with dag-pb leaves; `unixfs-v1-2025` a CIDv1 with
  1 MiB chunks and 1,024 links. `network` is `private` unless set to `public`. The
  `publish-pdf` dev script sets `v1` and `public`: a 2.2 MB PDF got a `bafybei…` CID, the
  same on a second upload (2026-10-10). A signed-URL upload pins the same setting and gives
  the same CID (below).
- **Public gateways for links** (2026-10-10): `ipfs.io/ipfs/<cid>` answers 200 with a text
  notice that it is "switching to a service worker gateway only", not the file;
  `dweb.link` and `w3s.link` answered 429; `gateway.pinata.cloud/ipfs/<cid>` served a 9 MB
  PDF (`application/pdf`). The pages link PDFs through Pinata's public gateway; the publish
  run reads through our dedicated gateway.
- **A PDF whose pages are pictures has no text for GROBID** (2026-10-10): a *Science* article
  saved from Chrome's viewer gave one embedded font (the download stamp) and one
  2475×3150 image per page; GROBID found no title and the run refused it `no-title`.
  GROBID reads the text layer and does no OCR.
- **Signed upload URLs** (`POST https://uploads.pinata.cloud/v3/files/sign`, 2026-10-10)
  take `date`, `expires` (seconds), `max_file_size`, `allow_mime_types` and `cid_version`,
  and answer `{ data: "<url>" }`. The browser POSTs `file` and `network` to that URL, so the
  uploader chooses the network. Pinata checks the type it detects from the bytes: a text
  file is refused (400 "does not grant permissions to upload detected MIME type"), as is a
  file over the size (400). With `cid_version: "v1"`, the 2.2 MB PDF got the same
  `bafybei…` CID as the `publish-pdf` upload.
- **Pinata keeps one file per CID in an account** (2026-10-10): uploading bytes already
  pinned answers with the existing file, and `GET https://api.pinata.cloud/v3/files/public?cid=…`
  lists one entry (`id`, `cid`, `size`, `mime_type`). So `DELETE /v3/files/public/{id}`
  removes every upload of those bytes, earlier ones included; a second delete answers 404.
  An unknown CID lists no files (200), and a bad key answers 401
  ([ADR 0010](adr/0010-pdf-to-target-ka-pipeline.md)).

## GROBID

Observed on `lfoppiano/grobid:0.9.1-crf`, 2026-10-09, except where a fact cites its docs.

- **The CRF image runs on ARM** (`arm64`, the node server, 2026-10-17): ready about 25 s
  after `docker run`, using about 3.5 GB of memory; it parsed arXiv 1706.03762's header like
  the x86 build.

- **`POST /api/processHeaderDocument`** takes the PDF as the multipart field `input` and,
  with `Accept: application/xml`, returns the header as TEI: the title under
  `titleStmt/title`, each author's `persName` (`forename`s, `surname`) under
  `sourceDesc/biblStruct/analytic/author`, the abstract's paragraphs under
  `profileDesc/abstract`, and any DOI as `idno type="DOI"`. arXiv 1706.03762 parsed in
  about a second.
- **It answers 204 when it finds nothing to extract and 503 when all its workers are
  busy** (GROBID docs): the first is final, the second worth a retry.
- **The CRF header model can read an affiliation as an author:** on arXiv 1706.03762 it
  listed "Google Brain" and "Google Research" among the ten authors, and found no DOI
  (the arXiv PDF prints none). A Target KA carries what GROBID read
  ([ADR 0010](adr/0010-pdf-to-target-ka-pipeline.md)).
- **The header model can drop a title's first words** (2026-10-17): it read "PUS7 mRNA
  pseudouridylation is driven by RNA sequence, structure, and cell-type-specific features"
  (Cell Genomics, 2026, whose first page prints the title on two lines) as "by RNA sequence,
  structure, and cell-type-specific features". The publisher's PDF stores the whole title in
  its own metadata, in its info dictionary's `Title` and its XMP `dc:title`, so the publish run
  completes GROBID's title from it (`completeTitle`, `packages/core` → Target KAs). The paper
  published on staging that day keeps the cut title
  ([ADR 0010](adr/0010-pdf-to-target-ka-pipeline.md)).
- **The header can give an accent apart from its letter** (2026-10-12): a cohort study's TEI
  listed "Montserrat Rodrı ´guez-Ayala" and "Bele ´n Moreno-Franco", the accent as a spacing
  `´` (U+00B4) after its letter, often after a space, and the `i` as a dotless `ı` (U+0131), the
  base LaTeX draws an accent on. On the 14 reference PDFs, every split accent came after its
  letter, and all were in authors' names. Once one opened the surname: "José Ramón Banegas"
  came as forename `Jose` and surname `´ramo ´n Banegas` (with GROBID's lowercase `r`).
  `parseTeiHeader` joins them back in names only (`packages/core` → Target KAs), since papers
  also write `´` as an apostrophe or a prime in titles and abstracts ("Alzheimer´s", "3´ UTR",
  "cytidine 5´-diphosphate"). Papers published before that fix keep the split names in their
  KAs.
- **`POST /api/processFulltextDocument` drops statements printed beside a paper's first page**
  (2026-10-11): on a PLOS ONE trial (e0269224, 12 pages, 11 s), the TEI held the body's
  sections as flat `div`s, each with its `head`, and the funding and data availability
  statements as `div type="funding"` and `div type="availability"` under `back`, but no
  trace of its "Competing interests" line. The scorer reads a PDF's text with unpdf instead
  (below).

## PDF text

Observed with unpdf 1.8.1 (a build of pdf.js with no worker), 2026-10-11.

- **It reads a paper's text, page by page, in well under a second:** a 12-page PLOS ONE PDF
  gave about 34,000 characters in 0.4 s, every statement beside the first page included.
- **It writes some accents apart from their letters,** as the PDF draws them: `Sante´`,
  `Franc¸ois`, `Je´re´mie`. A quote in which the model writes `Santé` matches only once
  accents are dropped (`packages/core` → Ratings).
- **It gives the page's text in the order the PDF draws it:** on PLOS pages the first page's
  sidebar (citation, editor, data availability, funding, competing interests) comes in
  pieces between the abstract's lines, so one statement can be split by text from another
  column. A line break inside a word keeps its hyphen (`Institu-` / `tional`).
- **Some PDFs make it print a font warning** (`Warning: TT: undefined function: 5`) on the
  console; the text is still read.

## Gemini

From the Gemini API's pricing and models pages (2026-10-11), and the rating run's first live
score the same day (plan 021).

- **The free tier includes `gemini-3.8-flash`,** a stable model, Google's newest Flash; Gemini
  3.1 Pro is not on the free tier. On the free tier, Google may use prompts and answers to
  improve its products ([ADR 0018](adr/0018-phase-1-scorer-output-contract.md)).
- **Rate limits are not published:** each account sees its own in Google AI Studio
  (`aistudio.google.com/rate-limit`). A 429 means one was hit.
- **The free tier allows 20 `gemini-3.8-flash` requests a day per project** (2026-10-11): the
  21st answered 429 `RESOURCE_EXHAUSTED`, with a `QuotaFailure` naming
  `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: "20"`, and a
  `RetryInfo` delay running to midnight Pacific time. Any 429 body says which quota was hit.
- **The quota belongs to the Google Cloud project, not the key:** every key of a project shares
  it. Google's API terms forbid getting around a documented limit ("You agree to, and will not
  attempt to circumvent, such limitations", `developers.google.com/terms`, read 2026-10-11),
  so more keys or projects are not a way to more free requests; Google's consent or a paid
  tier is.
- **The paid tier** (pricing page, read 2026-10-11): `gemini-3.8-flash` costs $0.75 per
  million input tokens and $3.75 per million output tokens, thinking tokens included, through
  2026-12-31, and twice that from 2027-01-01. Prompts and answers on the paid tier are not
  used to improve Google's products.
- **`POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`,**
  key in the `x-goog-api-key` header, with `generationConfig.responseMimeType:
  "application/json"` and `responseJsonSchema` (a JSON Schema: `integer` with `minimum` and
  `maximum`, `enum`, `required` all held): `gemini-3.8-flash` answered one JSON object
  matching it, in `candidates[0].content.parts[].text` with `finishReason: "STOP"`, and gave
  `modelVersion: "gemini-3.8-flash"`. A whole rating run took about 25 s on Anvil, the mint on
  Base Sepolia included.
- The docs also show a newer `/v1beta/interactions` endpoint with a `response_format` field;
  `generateContent` is not marked deprecated.
- **`gemini-3.8-flash` thinks before it answers by default,** which sets its pace (scorer v2,
  2026-10-11): a one-line prompt took 6 to 7 s; classifying a paper from its first 8,000
  characters about 20 s; answering a trial's 15 checks over its 62,000 characters about
  100 s. Its answers carry a `thoughtSignature` beside the text, and some gave no
  `modelVersion`. On the free tier, some calls failed within seconds and succeeded when
  tried again 30 s later.
- **The publish run's field check uses `gemini-3.5-flash-lite`,** free of charge on the
  pricing page (2026-10-11). Each model has its own daily quota (the 429 above names it
  `…PerModel-FreeTier`), so the field check leaves the scorer's 20 requests a day alone. On
  2026-10-12 it classified all 14 reference papers right from their title, abstract and first
  6,000 characters (`score-papers --field`), with the same request shape as the scorer.
- **A model Google is short of capacity for answers 503** (2026-10-12, `gemini-3.8-flash`): two
  papers got 503 on three tries 30 s apart, while Flash-Lite answered at the same time.
- **`gemini-3.8-flash` shortens some quotes with "…" or "..." although the prompt forbids it**
  (2026-10-12: 3 quotes across the 11 reference papers scored, each skipping text between two
  real passages), which is why quote matching accepts an ellipsis that stands for whole
  sentences.

## Chain

Observed on Base Sepolia (chain id 84532) with Alchemy RPC and the Alchemy Notify webhook.

- **Base produces a block every 2 seconds; a block is final only once its batch is final on
  L1,** minutes later. Reorgs before that are rare but possible (Base docs), which is why
  request ids are bound to their content ([ADR 0016](adr/0016-asset-names-derive-from-request-id.md)).
- **The free RPC tier caps `eth_getLogs` at 10 blocks,** so nothing may depend on scanning
  history; read current contract state instead ([ADR 0020](adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
- **Vercel's `CHAIN_RPC_URL` was Base's public endpoint (`https://sepolia.base.org`) until
  2026-10-18,** when the Alchemy RPC URL replaced it
  ([ADR 0005](adr/0005-staging-and-production-are-isolated.md) names one Alchemy RPC URL).
  Base calls its public endpoints rate-limited and not for production, and publishes no limit.
  On 2026-10-17 the papers list, reading 10 papers on staging's 3 contracts at once (about 30
  `eth_call`s, each its own request, tried once), showed a rated paper as "Not checked" after
  a redeploy and on hard refreshes, and its score on a later load: the public endpoint
  refusing the burst.
- **Alchemy RPC's free tier serves 500 compute units a second, and an `eth_call` costs 26**
  (Alchemy's pricing and compute-unit pages, read 2026-10-17): about 19 calls a second, past
  which it answers 429, so the same burst would cross it too. The site's pages now send the contract reads made together as one
  Multicall3 call (`0xcA11bde05977b3631167028862bE2a173976CA11` on Base Sepolia, in viem's
  chain definition), one `eth_call` per round of reads, three for the papers list (the counts,
  the ids, the requests), and ask a failed call once more a second later. A smart wallet's
  signature check is a deployless `eth_call` with no contract address (ERC-6492), which
  Multicall3 cannot carry, so each is its own call; a wallet's plain signature is checked
  without the chain.
- **The Alchemy Notify webhook delivers a log to every rule matching its contract:** keep exactly one
  rule per contract, or one request reaches two oracles.
- **Each Alchemy Notify webhook signs with its own key:** `X-Alchemy-Signature` is the hex
  HMAC-SHA256 of the raw body under the webhook's signing key (Alchemy's webhook docs), so the
  body must be checked as received, before any parse; a route checking another environment's
  key answers 401, so repeated 401s mean a key swapped between environments
  ([ADR 0017](adr/0017-chain-events-are-ingested-at-least-once.md)). A Custom Webhook's
  delivery carries the fields its GraphQL query asks for (`packages/workflows` README → The
  Alchemy Notify webhook).
- **A Custom Webhook delivers every block its query runs on, matching or not,** unless it is
  created with `skip_empty_messages` (the API's `graphql_query: { query, skip_empty_messages:
  true }`); on Base, a delivery every 2 seconds. In its log filter, an empty `topics` list
  matches every event of the listed addresses, and an empty address list every address
  (Alchemy's Custom Webhooks docs). The dashboard's form has the same choice as an "Include
  empty messages" box, unchecked by default (2026-10-17).
- **The staging webhook reached `develop` through the protection bypass** (2026-10-17): a
  request from the wallet started a rating run on the deployed app, which settled, minted its
  R-KA and posted to Telegram.
- **After a reorg, the Alchemy Notify webhook delivers the new block** (Alchemy's Custom
  Webhooks FAQ): the same block number with a new hash means the earlier delivery's logs
  left the chain. Its GraphQL logs carry no per-log `removed` mark, so a run reads the
  request on chain before acting ([ADR 0017](adr/0017-chain-events-are-ingested-at-least-once.md)).
- **Base has no public mempool:** the RPC forwards transactions to the sequencer, so
  whether Alchemy RPC's pending nonce (`eth_getTransactionCount(…, "pending")`) shows a
  transaction not yet included is to verify ([ADR 0019](adr/0019-oracle-transactions-are-serialized.md)).
- **Anvil, for local rating runs** (Foundry 1.8.4, 2026-10-11,
  [ADR 0036](adr/0036-local-rating-runs-use-anvil.md)): its default port 8545 is the DKG node's
  RPC proxy's, and on a computer running the proxy a call to `127.0.0.1:8545` answers as Base
  Sepolia (chain id 84532), so Anvil runs on 8546. `forge script … --broadcast --unlocked --sender
  <Anvil's first account>` deploys with no key passed, since Anvil signs for its built-in
  accounts; the first deploy on a fresh chain lands at
  `0x5FbDB2315678afecb367f032d93F642f64180aa3`. The base fee starts at 1 gwei; viem's
  `setBalance` (test client, mode `anvil`) funds any address.
- **Replacing a pending transaction needs both `maxFeePerGas` and `maxPriorityFeePerGas`
  raised by at least 10%** (geth's default price bump; to verify on Base), or it is
  rejected as underpriced ([ADR 0019](adr/0019-oracle-transactions-are-serialized.md)).

## Inngest and Vercel

Observed on Vercel Hobby with Inngest Cloud, except where a fact cites the vendor's docs.

- **Vercel Hobby stops any function at 300 s,** which is shorter than a slow mint.
- **Inngest keys:** Production has its own pair; all branch environments share one other
  pair, and the SDK picks the branch from `VERCEL_GIT_COMMIT_REF`.
- **REST reads (run status) must send `x-inngest-env`** with the branch name, or they match
  nothing. `GET /v1/events/{event id}/runs` lists an event's runs (`status`: `Running`,
  `Completed`, `Failed`, `Cancelled`; `output`), with the signing key as bearer token
  (Inngest docs).
- **The local dev server's REST run read gives an empty `output`** (inngest-cli 1.46.0,
  2026-10-10): `/v1/events/{id}/runs` answered `status: "Completed"` with `output: ""` for a
  run that returned a refusal, and caches each answer for 15 s. Only its internal GraphQL
  API carried the output: `POST /v0/gql` with
  `query ($id: String!) { run(runID: $id) { output } }` (the type is `String!`, not
  `ULID!`) answers the ops as JSON text, the return value under the `RunComplete` op's
  `data`. `readRun` reads it there locally (`devServer`).
- **Preview deployments need Vercel's deployment-protection bypass** configured, or Inngest
  cannot reach `/api/inngest`. The stable `develop` deployment is a preview too, so the
  staging webhook needs the same bypass; a caller that cannot set headers passes it as the
  `x-vercel-protection-bypass` query parameter. On Hobby (2026-10-17), "Protection Bypass for
  Automation" gives the secret; Inngest's Vercel integration takes it in its settings and
  synced `develop`'s app, under the `develop` branch environment.
- **The Inngest Vercel integration sets the keys itself** (2026-10-17): `INNGEST_EVENT_KEY`
  and `INNGEST_SIGNING_KEY` for Production and for Preview, and it syncs the app on each deploy.
- **Vercel's import offers a multi-service project for this repo** (2026-10-17), since it
  detects more than one app, with a suggested `vercel.json`; one project with Root Directory
  `apps/web` builds the site with neither.
- **Turborepo warns on Vercel that the project's variables are missing from `turbo.json`
  and "WILL NOT be available"** (2026-10-17): that holds for the build alone, which needs only
  `APP_ENV` (`globalEnv`); the functions read every variable from Vercel when they run.
- **MetaMask warns on a new `*.vercel.app` domain,** in two ways. On `develop`'s branch URL
  (2026-10-17), a full page before connecting: "This site shows signs of phishing or
  wallet-draining activity". On production's `verisci.vercel.app` (2026-10-18), a warning on
  connecting and on every signature and transaction that the site may be a scam. Neither
  domain was on MetaMask's `eth-phishing-detect` lists (its repo's list, the live list and its
  recent changes) nor known to ChainPatrol (checked 2026-10-18), so the warnings come from
  Blockaid's live scan. The alert offered no "Report an issue"; the report went through
  Blockaid's form (https://report.blockaid.io/, "Mistake") on 2026-10-18, and
  `eth-phishing-detect` closes reports of Blockaid's flags "not planned". Reown's allowed
  domains affect neither.
- **Vercel Web Analytics on the Hobby plan** (vercel.com/docs/analytics, 2026-10-18): free,
  for any number of projects, 50,000 events a month shared by the account (collection pauses
  past it, never billed), one month of data, a country panel; no cookies (a visitor is a
  hash of the request, reset daily), bots left out ([ADR 0041](adr/0041-production-counts-visits-without-cookies.md)).
- **Upstash's free plan allows one database** (2026-10-17), so staging and production share
  it, each counter named after its environment ([ADR 0005](adr/0005-staging-and-production-are-isolated.md)).
- **A run past its time budget is cancelled, not failed** (Inngest docs, system events): Inngest
  sends `inngest/function.cancelled` for it, as for a run cancelled by hand or through the API,
  with the function and run ids (the docs add an error "function cancelled"; inngest 4.22.0's
  types carry only the ids), and
  `inngest/function.failed` only for a run that failed after its retries. An alert on failures
  alone misses a run that ran out of time ([ADR 0038](adr/0038-alerts-go-to-one-telegram-chat.md)).
- **Inngest archives a branch environment 3 days after its latest deploy** (Inngest docs),
  unless auto-archive is disabled for it in the dashboard. Archiving stops its functions
  from triggering, so staging stops after three quiet days on `develop` ([ADR 0005](adr/0005-staging-and-production-are-isolated.md)).
- **Unverified: cron functions in a branch environment.** Inngest's docs do not say
  whether a branch environment runs scheduled functions; staging's reconciler relies on
  it, so the first deploy checks it on `develop` ([ADR 0020](adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
- **Only production and the stable `develop` deployment receive webhooks:** feature
  previews have no stable URL to register.
- **Inngest concurrency limits count running steps, not runs:** a run that is sleeping or
  waiting holds no slot, so a concurrency key cannot keep two functions (or two runs) off
  the same request ([ADR 0020](adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
- **Inngest `singleton` (mode `skip`) locks a whole run, sleeps included:** while a run for
  a key is active, new runs for that key are skipped (Inngest docs) ([ADR 0020](adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
- **Unverified: whether runs the throttle holds count as active for `singleton`.** Inngest's
  docs describe each alone (2026-10-16): the throttle queues runs, the singleton skips new ones
  while one is active. If queued runs do not count, every restart event for a request would
  queue another run; the reconciler's event id carries a 4-hour window, so it sends one restart
  per request per window either way ([ADR 0020](adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
- **Unverified: whether the local dev server runs cron functions on their schedule.** Inngest's
  docs say crons trigger functions, not how the dev server fires them (2026-10-16); the local
  reconciler relies on it (`packages/workflows` README → Running a rating locally).
- **Inngest deduplicates event ids for 24 hours only:** an event re-sent later with the
  same id starts a new run ([ADR 0017](adr/0017-chain-events-are-ingested-at-least-once.md)).
  Within the 24 hours the dev server still logs "initializing fn" but starts no run, and
  `GET /v1/events/{id}/runs` answers an empty list (2026-10-10): an id that a user can repeat
  (the same PDF published again by the same wallet) must carry something new per attempt,
  as the submission's deadline does.
- **A function created with no triggers can only be invoked** with `step.invoke` (Inngest
  4.22.0; its `opts.triggers` reads `[]`). The dev server ran the oracle function that way.
  Step outputs are serialized as JSON, and `JSON.stringify` throws on a `bigint`.
- **Inngest caps sizes:** an event payload at 256 KB, a step's output at 4 MB, a run's
  state at 32 MB and a function at 1,000 steps (Inngest docs, to verify on our plan).
  Payloads carry ids, never file bytes ([ADR 0010](adr/0010-pdf-to-target-ka-pipeline.md)).
- **Vercel Hobby runs cron jobs at most once a day,** at an imprecise time within the
  hour (Vercel docs), so schedules run as Inngest crons ([ADR 0020](adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
- **Inngest's free plan allows 50,000 executions a month and 5 concurrent steps**
  (Inngest pricing): every step, poll and cron tick counts against the first, so poll
  and cron intervals and the rating throttle are set against it ([ADR 0008](adr/0008-mints-are-async-polled-in-short-steps.md),
  [ADR 0015](adr/0015-rating-requests-are-free-on-testnet.md)); every executing step
  holds one of the 5 (whether branch environments share them is to verify), so a long
  step such as waiting for a receipt delays every other workflow ([ADR 0019](adr/0019-oracle-transactions-are-serialized.md)).
- **Vercel caps a function's request body at 4.5 MB** (Vercel docs, to verify on our
  plan). The prototype raised the server-action limit to 5 MB, so uploads between 4.5
  and 5 MB likely failed with a 413 in production ([ADR 0010](adr/0010-pdf-to-target-ka-pipeline.md)).

## Next.js

Observed on Next.js 16.3.8.

- **`NEXT_PUBLIC_*` values are inlined at build time,** and only when read literally
  (`process.env.NEXT_PUBLIC_X`); changing one needs a new deployment.
- **Next only loads env files from its own app directory.** `apps/web/next.config.ts`
  loads the repo-root files instead (see Tooling for why it needs `forceReload`).
- **Next watches only `apps/web` for env changes:** editing a root env file needs a dev
  server restart, and an env file left in `apps/web` can be reapplied on a dev reload.
- **Turbopack resolves lazy imports of optional packages at build** (16.3.8, 2026-10-10):
  wagmi's connectors reach Coinbase's SDK, whose lazily imported `@x402/*` packages are
  optional peers; `next build` fails on them until `turbopack.resolveAlias` points them at a
  module declaring the imported names (`apps/web/next.config.ts`).
- **A response's status is sent with its first streamed chunk** (Next.js docs,
  `03-api-reference/04-functions/not-found.md`, 16.3.8): `notFound()` inside a `Suspense`
  boundary renders the not-found page as a 200 with `noindex`, a soft 404; a real 404 needs
  the check before any `await` that suspends or any `Suspense` boundary. Seen on `/papers`
  (2026-10-10): `?page=0` answered 404, a page past the last 200 with `noindex`.
- **Metadata streams for browsers and blocks for HTML-limited bots** (16.3.8, 2026-10-18):
  `notFound()` from `generateMetadata` gives a bot in `htmlLimitedBots` a real 404, and a
  browser the not-found page with `noindex` and a 200, since its metadata streams after the
  first chunk. Setting `htmlLimitedBots` replaces Next's own list
  (`next/dist/shared/lib/router/utils/html-bots.js`), which leaves out the AI crawlers
  (`apps/web/lib/seo/bots.ts` extends it).
- **A streamed `Suspense` boundary's content arrives in a hidden `<div>`**, moved into place by
  a script, whatever the user agent: a crawler that runs no JavaScript finds a paper's `h1`
  only there. Rendering the page without the boundary for those bots puts it in place
  (observed with `curl -A "OAI-SearchBot/1.0"`, 2026-10-18).
- **React's `cache` shares one read between `generateMetadata` and the page** of one request
  (one node read per request, counted on the dev server, 2026-10-18).
- **`alternates.canonical: "./"` in the root layout resolves to each page's own path, without
  its query**; a page whose query names a different page (`/papers?page=2`) sets its own.
- **A page's `openGraph` replaces its parents' whole**, not field by field; Next fills its
  title and description from the page's own when the block leaves them out, and a segment's
  `opengraph-image` file wins over its parents'. The root layout's `title.template` does not
  apply to `app/page.tsx`, which shares its segment.
- **`next/og` reads TTF, OTF and WOFF fonts, not WOFF2,** and bundles only Geist Regular, so
  the share images read Sora from `apps/web/assets/fonts`; Next traces files read with
  `readFile(join(process.cwd(), …))` into the deployment (16.3.8, checked in the build's
  `.nft.json`, 2026-10-18).
- **Everything a `"use client"` file exports reaches a server component as a client
  reference**, not its value, so a string or constant the server needs lives in a plain
  module (`apps/web/components/paper/labels.ts`).
- **Lighthouse's mobile run counts every script requested before the first paint toward
  LCP** (Lighthouse 13.5, simulated 4G, 2026-10-18): with the wallet's chunks on every page,
  the simulated LCP was 4.6-6.2 s while the observed one was about 140 ms. `next dev` serves
  unminified development code (its LCP read 13.9 s), so performance is measured on
  `next build` then `next start`, in a fresh private window.
- **Turbopack keeps every module a workspace package's entry point re-exports** unless the
  package declares `"sideEffects": false` (16.3.8, 2026-10-18): one `canonicalCid` import from
  `@labstrail/core` brought core's Zod schemas into a 490 KB client chunk (125 KB sent) until
  core declared it; then the chunk left those pages.
- **AppKit's vanilla `createAppKit` (`@reown/appkit`) builds the same `AppKit` class as the
  React one** and needs no `WagmiProvider` (1.8.24, read in its source, 2026-10-18): its
  window and wagmi's actions (`wagmi/actions`) share the `WagmiAdapter`'s config. On start it
  restores the stored session itself (`syncExistingConnection`, `syncAdapterConnections`,
  awaited by `ready()`), and it keeps `@appkit/connection_status` in `localStorage` as
  `connected` or `disconnected`, which the web app reads to restore a returning visitor's
  wallet (`apps/web/lib/wallet/session.ts`).
- **What loading the wallet calls** (AppKit 1.8.24, `@base-org/account` 2.4.0,
  `@coinbase/wallet-sdk` 4.3.6, read in their source and seen in a headless browser,
  2026-10-18): AppKit fetches its project settings from `api.web3modal.org`, and always sends
  Reown (`pulse.walletconnect.org`) its `INITIALIZE`, `CONNECT_SUCCESS` and
  `SOCIAL_LOGIN_SUCCESS` events, whatever `features.analytics` says. `ready()` awaits those
  settings with no timeout. Coinbase's two SDKs load Coinbase's analytics
  (`cca-lite.coinbase.com`) unless `preference.telemetry` is `false`; AppKit's own Base Account
  and Coinbase Wallet connectors set no preference, so the web app configures both connectors
  itself: AppKit skips its Base Account connector when one is configured, and
  `enableCoinbase: false` leaves its Coinbase Wallet one out (it also makes Coinbase's mobile
  link always open the Coinbase app, which a phone without the extension does anyway).

## Tooling

Observed on Turbo 2.11, `@next/env` 16.3.8, `@t3-oss/env-core` 0.13 and Zod 4.6, except where
a fact names another tool.

- **Node's type stripping (Node 24) only erases type syntax:** `enum`, `namespace` and
  constructor parameter properties create JavaScript, so plain Node refuses them.
  `erasableSyntaxOnly` in `tsconfig.base.json` makes `tsc` refuse them too
  ([ADR 0002](adr/0002-internal-packages-ship-typescript-source.md)).
- **`@next/env` caches its first `loadEnvConfig`,** and Next has already loaded `apps/web`
  before it reads `next.config.ts`, so loading the root needs `forceReload`. Env values set
  while the config loads are copied into Next's startup snapshot, so they survive dev env
  reloads.
- **Turbo's strict env mode strips every variable a task does not declare:** shared ones go
  in `globalEnv`. Root env files must be build `inputs` (`$TURBO_ROOT$/.env*`) or a changed
  `.env.local` replays a stale build. Turbo hashes file content, not modification time.
- **`@t3-oss/env-core` has three traps:** `emptyStringAsUndefined` deletes keys from the
  object it is given (`process.env` by default), so `defineEnv` passes a copy; `extends`
  merges presets without validating them again; `skipValidation` returns the whole runtime
  env, secrets included, with no defaults.
- **Tailwind v4 puts utilities in a cascade layer, and unlayered CSS beats any layer**
  (Tailwind 4.3.3, 2026-10-10): `apps/web/app/globals.css`'s `li { text-wrap: pretty }` beat
  `truncate` on an `li`, which wrapped instead of cutting the text. Put the utility on a
  child element, or put the global rule in `@layer base`.
- **Zod 4 reports a missing enum value as "Invalid option".** Give the schema its own
  `error` callback when "required" is what is actually wrong.
