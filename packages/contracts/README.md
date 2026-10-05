# @verisci/contracts

Solidity contracts (Foundry), plus the TypeScript side that the other
workspaces import.

Status: `RatingController` v2, written and tested, with its deploy script, typed ABI and
deployment records. `deployments/base-sepolia.json` lists what is deployed.

## RatingController

Records phase-1 rating requests on chain and the oracle's answers. Its public
API (types, events, errors and function signatures, with their NatSpec) is
`src/interfaces/IRatingController.sol`; `src/RatingController.sol` implements
it. A fix is a redeploy: the old contract is paused and keeps settling the
requests still pending on it
([ADR 0023](../../docs/adr/0023-contract-is-not-upgradeable.md),
[ADR 0027](../../docs/adr/0027-past-contracts-are-paused-and-drained.md)).

- **Request.** Anyone calls `requestPhase1(targetUal)` with a non-empty UAL
  and gets a `requestId`, the `keccak256` of the chain id, the contract
  address, a nonce, the requester and the UAL's hash, so every request on every
  deployment gets its own id
  ([ADR 0016](../../docs/adr/0016-asset-names-derive-from-request-id.md)).
  A requester can have at most `maxPendingPerRequester` pending requests,
  passed to the constructor and changed by the owner
  ([ADR 0015](../../docs/adr/0015-rating-requests-are-free-on-testnet.md)).
- **Fulfil.** Only `oracleAgent` calls `fulfilPhase1(requestId, score, rKaUal)`,
  with a score from 0 to 100 and the R-KA's UAL. The record holds the phase-1
  score only; a later phase gets its own field in a later contract version
  ([ADR 0012](../../docs/adr/0012-ratings-evolve-in-three-phases.md)).
- **Cancel.** Only `oracleAgent` calls `cancelRequest(requestId, reason)`, with
  the reason the request stopped: `Expired` (pending past the maximum age) or
  `InvalidTarget`. In an emergency the owner replaces the oracle, and the new
  oracle cancels
  ([ADR 0020](../../docs/adr/0020-a-cron-reconciler-recovers-stuck-requests.md),
  [ADR 0024](../../docs/adr/0024-only-the-oracle-cancels-requests.md)).
- **Read.** `getRatingRequest(requestId)` returns the full `RatingRequest`
  record (status `None` for an unknown id). `pendingCount()` counts the
  pending requests, and
  `pendingRequestIds(offset, limit)` returns up to `limit` of their ids from
  index `offset`, so a long list is read in chunks; the order changes as
  requests settle. `requestCountOf(targetUal)` and
  `requestIdsOf(targetUal, offset, limit)` do the same for a target's request
  ids, oldest first ([ADR 0022](../../docs/adr/0022-contract-indexes-request-ids-by-target.md)).
- **Pause.** The owner calls `pause()` to stop new requests: `requestPhase1`
  then reverts with `EnforcedPause`, while `fulfilPhase1` and `cancelRequest`
  keep working, so pending requests still settle. `unpause()` lets requests in
  again, and `paused()` reads the state. After a redeploy the old contract is
  paused and drained; the pause also stops a spam wave without a redeploy
  ([ADR 0027](../../docs/adr/0027-past-contracts-are-paused-and-drained.md)).
- **Admin.** The owner sets `oracleAgent` and `maxPendingPerRequester`, and
  pauses requests. Ownership moves in two steps (OpenZeppelin `Ownable2Step`:
  `transferOwnership`, then `acceptOwnership`), and the contract always has an
  owner: `renounceOwnership` reverts with `RenounceOwnershipDisabled`.

Failures revert with custom errors, and every state change emits an event
(`Phase1Requested`, `Phase1Fulfilled`, `RequestCancelled`,
`OracleAgentUpdated`, `MaxPendingPerRequesterUpdated`, and OpenZeppelin's
`Paused` and `Unpaused`).

### Life of a request

```text
                 requestPhase1 (anyone)
                         │  checks: not paused, UAL not empty, under the cap
                         │  id = hash(chain, contract, nonce, requester, UAL)
                         ▼
   ┌──────────────── Pending ────────────────┐
   │   in _pendingRequestIds  (reconciler)   │
   │   in _requestIdsOf[UAL]  (UI)           │
   │   pendingCountOf[requester] + 1         │
   └─────────────────────────────────────────┘
        │ fulfilPhase1 (oracle)        │ cancelRequest (oracle)
        │ score ≤ 100, R-KA set        │ Expired | InvalidTarget
        ▼                              ▼
    Fulfilled                      Cancelled
        └──────── final: leaves the pending set, frees a cap slot,
                  stays in _requestIdsOf, never changes again

   owner: setOracleAgent, setMaxPendingPerRequester, pause/unpause (requests only),
          two-step ownership transfer
```

## Deploy

`script/HelperConfig.s.sol` holds the constructor arguments for each
environment: local Anvil (chain 31337), and staging and production on Base
Sepolia (chain 84532). Both Base Sepolia environments share one chain id, so
`DEPLOY_ENV` picks one there. `script/DeployRatingController.s.sol` deploys
from that config, and the account that signs the broadcast becomes the owner.
The Foundry tests deploy through the same script.

Staging's and production's oracle addresses stay zero until their wallets
exist, so a deploy to either reverts with `ZeroAddress` before anything is
broadcast. Put the addresses in `HelperConfig` in a commit before the first deploy.

You deploy from your own machine. Fill in the Foundry section of `.env.example`
in the root `.env.local`. Forge reads a `.env` next to `foundry.toml`, so link
it to that file once; the link is gitignored like every env file
([ADR 0029](../../docs/adr/0029-forge-reads-the-root-env-file.md)). Pass
`DEPLOY_ENV` on the command line, so every deploy names its environment.

```bash
# Once, from packages/contracts: let forge read the root .env.local.
ln -s ../../.env.local .env

# Once: store the deployer key encrypted in a Foundry keystore.
cast wallet import verisci-deployer --interactive

# Without --broadcast, a dry run on an in-memory chain, or against Base Sepolia with --rpc-url.
forge script script/DeployRatingController.s.sol

# Deploy and verify on Basescan.
DEPLOY_ENV=staging forge script script/DeployRatingController.s.sol \
  --rpc-url base_sepolia --account verisci-deployer --broadcast --verify

# Record it in deployments/base-sepolia.json, then commit that file in a PR.
pnpm --filter @verisci/contracts record-deployment staging
```

### First deploy of an environment

1. Create its oracle wallet with `cast wallet new`, and keep the key safe: the
   agents use it to fulfil and cancel ([ADR 0019](../../docs/adr/0019-oracle-transactions-are-serialized.md)).
   Each environment has its own oracle
   ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)).
2. Put that address in `HelperConfig` (`STAGING_ORACLE` or `PRODUCTION_ORACLE`)
   on a branch.
3. Create the deployer wallet and import it as the `verisci-deployer`
   keystore (once for both environments). It becomes the owner.
4. Fund the deployer with Base Sepolia ETH from a faucet.
5. In the root `.env.local`, fill in `BASE_SEPOLIA_RPC_URL` and
   `ETHERSCAN_API_KEY`, and create the `.env` link above.
6. Dry-run against Base Sepolia, which simulates without sending:
   `DEPLOY_ENV=staging forge script script/DeployRatingController.s.sol --rpc-url base_sepolia`.
7. Deploy with `--broadcast --verify`, run `record-deployment`, and commit
   `HelperConfig` and `deployments/base-sepolia.json` in one PR into `develop`.

`record-deployment` reads the run that `--broadcast` wrote
(`broadcast/DeployRatingController.s.sol/84532/run-latest.json`), so run it
right after the deploy. It makes the new contract the environment's `current`
and moves the previous one to the front of `past`. It refuses a dry run,
another chain, or an address already recorded, and then writes nothing
([ADR 0028](../../docs/adr/0028-deployed-addresses-are-committed.md)).

After a redeploy, pause the old contract so it takes no new requests, while
the oracle settles what is still pending on it
([ADR 0027](../../docs/adr/0027-past-contracts-are-paused-and-drained.md)):

```bash
cast send <old address> "pause()" --rpc-url base_sepolia --account verisci-deployer
```

## TypeScript side

What other workspaces import from `@verisci/contracts`:

| Export | What it is |
| --- | --- |
| `ratingControllerAbi` | The contract's ABI, `as const`, so viem infers every function, event and error |
| `ratingControllerDeployments(appEnv)` | `{ chainId, current, past }` for `staging` or `production`; `local` reads staging's ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)). `current` takes new requests; `past` are paused and drained ([ADR 0027](../../docs/adr/0027-past-contracts-are-paused-and-drained.md)) |
| `contractsName` | The package name, listed on the web app's home page |
| `NoDeploymentError` | Thrown by `ratingControllerDeployments` for an environment with no current deployment |
| `Deployment`, `DeployEnv`, `RatingControllerDeployments` | Their types |

Each `Deployment` holds the contract `address`, the deploy `txHash` and
`blockNumber`, its `owner`, `oracleAgent` and `maxPendingPerRequester` at
deploy time, and the git `commit` it was deployed from. The owner can change
the oracle and the cap later; read them from the contract.

`deployments/base-sepolia.json` is validated when the package is imported, so
a malformed file fails every importer with the bad field named.

## Depends on

`@verisci/core`, `@verisci/env`

## Layout

```text
src/            # .sol contracts (Foundry) and the TypeScript side (index.ts, deployments)
src/interfaces/ # contract interfaces: types, events, errors, NatSpec
src/generated/  # generated: the typed ABI (committed)
script/         # Foundry scripts: HelperConfig (per-environment config), DeployRatingController
test/           # Foundry tests: *.t.sol unit and fuzz, *.inv.t.sol invariants, handlers/
tools/          # Node scripts: generate-abi, record-deployment (with their Vitest tests)
deployments/    # generated: deployed addresses per environment (committed)
foundry.toml    # compiler, fuzz and invariant profiles, Base Sepolia RPC and Basescan
.env            # your link to the root .env.local, which forge reads (gitignored, ADR 0029)
soldeer.lock    # pinned Solidity dependencies
remappings.txt  # written by hand: one line per dependency → dependencies/<name>-<version>/
```

`out/`, `cache/`, `dependencies/` and `broadcast/` (written by `forge script
--broadcast`) are generated and gitignored.

`src/generated/` and `deployments/` are generated too, but committed, since
Vercel has no Foundry and the addresses are reviewed in PRs. Never edit them
by hand:

- After changing a contract's interface, run `pnpm --filter @verisci/contracts
  generate:abi` and commit the result. CI regenerates it and fails if it
  differs. Biome skips `src/generated/`.
- `deployments/base-sepolia.json` changes only through `record-deployment`
  (`record-deployment --init` wrote the empty file).

## Toolchain

| Tool | Version | Pinned in |
| --- | --- | --- |
| Foundry | 1.8.4 | `.github/workflows/ci.yml` (`foundry-toolchain`); install locally with `foundryup --install 1.8.4` |
| solc | 0.8.37 | `foundry.toml` (`solc_version`) |
| forge-std | 1.17.0 | `foundry.toml` `[dependencies]` and `soldeer.lock`, via Soldeer |
| OpenZeppelin Contracts | 5.7.0 | `foundry.toml` `[dependencies]` and `soldeer.lock`, via Soldeer |
| solhint | 6.2.4 | `package.json` |

To bump a dependency: `forge soldeer install <name>~<version>` (`forge-std`,
`@openzeppelin-contracts`), then update its path in `remappings.txt`.

## NatSpec and lint

Every contract, interface, library and script needs `@title` and `@notice`. Every
public or external function, event and error needs `@notice`, `@param` and
`@return`, or `@inheritdoc`. solhint's `use-natspec` rule enforces this at
`error` in `pnpm check`; it is the only solhint rule enabled, so it does not
overlap with `forge fmt` or `forge lint`.

`forge lint --deny notes` runs in `pnpm check` and after every `.sol` edit, so
any lint warning or note fails
([ADR 0025](../../docs/adr/0025-reviews-gate-on-adrs-and-lint.md)).
`foundry.toml` turns on all five severities (high, medium, low, info, gas)
and excludes `asm-keccak256`, which trades readability for a little gas. To
accept one finding, put `// forge-lint: disable-next-line(<lint-id>)` above
the line, with a comment saying why. Foundry 1.8.4 lints `src/` only.

## Scripts

| Command | What it does |
| --- | --- |
| `forge soldeer install` | Installs the Solidity dependencies from `soldeer.lock` |
| `pnpm --filter @verisci/contracts check` | `forge fmt --check`, then `forge lint --deny notes`, then solhint NatSpec on `src/` and `script/` |
| `pnpm --filter @verisci/contracts test` | Vitest for the TypeScript side, then `forge test` |
| `pnpm --filter @verisci/contracts typecheck` | Typechecks the TypeScript side |
| `forge build --sizes` | Compiles and reports contract sizes |
| `FOUNDRY_PROFILE=ci forge test` | Tests with the CI fuzz and invariant runs |
| `pnpm --filter @verisci/contracts generate:abi` | `forge build`, then writes `src/generated/rating-controller-abi.ts` |
| `pnpm --filter @verisci/contracts record-deployment <staging\|production>` | Records the latest Base Sepolia broadcast in `deployments/base-sepolia.json` |

The TypeScript side ships as source (`src/index.ts`), with no build step.
The tools run with Node's type stripping; `erasableSyntaxOnly` in `tsconfig.json`
keeps the package to syntax Node can strip.
