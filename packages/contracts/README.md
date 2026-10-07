# @verisci/contracts

Solidity contracts built with Foundry, and the TypeScript bindings the other
workspaces import: the typed ABI and the deployed addresses of each environment.

Status: `RatingController` v2 is implemented and tested. Deployed addresses are
recorded in `deployments/base-sepolia.json`.

## RatingController

Records phase-1 rating requests on chain, and the oracle's answers. The public
API (types, events, errors and function signatures, with their NatSpec) is
defined in `src/interfaces/IRatingController.sol` and implemented in
`src/RatingController.sol`. The deployed code is final: a fix is a redeploy,
after which the previous contract is paused and settles the requests still
pending on it
([ADR 0023](../../docs/adr/0023-a-fix-is-a-redeploy-owner-powers-fixed.md)).

- **Request.** Anyone calls `requestPhase1(targetUal)` with a non-empty UAL and
  receives a `requestId`: the `keccak256` of the chain id, the contract
  address, a nonce, the requester and the UAL's hash. Every request on every
  deployment therefore has its own id
  ([ADR 0016](../../docs/adr/0016-asset-names-derive-from-request-id.md)).
  Each requester may hold at most `maxPendingPerRequester` pending requests
  ([ADR 0015](../../docs/adr/0015-rating-requests-are-free-on-testnet.md)).
  The contract stores and hashes the UAL exactly as given, so callers send the
  canonical spelling from `normalizeUal` in `@verisci/core`; the oracle cancels
  a request whose UAL is in any other spelling with `InvalidTarget`
  ([ADR 0031](../../docs/adr/0031-uals-are-normalized-before-the-contract.md)).
- **Fulfil.** The oracle calls `fulfilPhase1(requestId, score, rKaUal)` with a
  score from 0 to 100 and the R-KA's UAL. The record holds the phase-1 score;
  later phases get their own fields in later contract versions
  ([ADR 0012](../../docs/adr/0012-three-phases-settled-by-the-oracle.md)).
- **Cancel.** The oracle calls `cancelRequest(requestId, reason)` with
  `Expired` (pending past the maximum age) or `InvalidTarget`. In an
  emergency, the owner assigns the oracle role to another key, which then
  cancels
  ([ADR 0020](../../docs/adr/0020-stuck-requests-recovered-only-oracle-cancels.md)).
- **Read.** `getRatingRequest(requestId)` returns the full `RatingRequest`
  record, with status `None` for an unknown id. `pendingCount()` and
  `pendingRequestIds(offset, limit)` list pending requests in chunks; their
  order changes as requests settle. `requestCountOf(targetUal)` and
  `requestIdsOf(targetUal, offset, limit)` list a target's requests, oldest
  first ([ADR 0022](../../docs/adr/0022-contract-indexes-request-ids-by-target.md)).
- **Pause.** The owner's `pause()` stops new requests: `requestPhase1` reverts
  with `EnforcedPause`, while `fulfilPhase1` and `cancelRequest` keep working
  so pending requests still settle. `unpause()` reopens requests, and
  `paused()` reads the state. Pausing retires a replaced contract and also
  serves as an emergency brake
  ([ADR 0023](../../docs/adr/0023-a-fix-is-a-redeploy-owner-powers-fixed.md)).
- **Administration.** The owner sets `oracleAgent` and
  `maxPendingPerRequester`, and pauses and unpauses new requests
  ([ADR 0023](../../docs/adr/0023-a-fix-is-a-redeploy-owner-powers-fixed.md)). The owner and
  the oracle are always distinct addresses: an oracle equal to the owner, or ownership moving
  to the oracle, reverts with `SameOwnerAndOracle`
  ([ADR 0030](../../docs/adr/0030-owner-and-oracle-are-different-addresses.md)).
  Ownership moves in two steps (OpenZeppelin `Ownable2Step`), and
  `renounceOwnership` reverts with `RenounceOwnershipDisabled`, so the
  contract always has an owner
  ([ADR 0023](../../docs/adr/0023-a-fix-is-a-redeploy-owner-powers-fixed.md)).

Failures revert with custom errors. Every state change emits an event:
`Phase1Requested`, `Phase1Fulfilled`, `RequestCancelled`,
`OracleAgentUpdated`, `MaxPendingPerRequesterUpdated`, and OpenZeppelin's
`Paused` and `Unpaused`.

### Request lifecycle

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

## Deployment

Staging and production each have their own contract on Base Sepolia (chain id
84532) ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)).
Deployments run from a maintainer's machine; all commands below run from
`packages/contracts`.

### Accounts

| Account | Role on the contract | Key custody |
| --- | --- | --- |
| Deployer (`verisci-deployer` keystore), shared by both environments | Owner: pauses and unpauses new requests, updates the oracle and the cap, transfers ownership | Encrypted Foundry keystore on the maintainer's machine only |
| Oracle, one per environment | Fulfils and cancels requests | Stored securely until the environment's agents deployment (`develop` or `main`) holds it |

The two roles always use distinct addresses: the oracle key runs on a server,
while the owner key stays offline
([ADR 0019](../../docs/adr/0019-oracle-transactions-are-serialized.md),
[ADR 0030](../../docs/adr/0030-owner-and-oracle-are-different-addresses.md)).

### Prerequisites

One-time setup per machine:

1. **Link forge to the root env file.** Forge reads a `.env` file next to
   `foundry.toml`; link it to the root `.env.local`. The link is gitignored
   ([ADR 0004](../../docs/adr/0004-env-variables-per-workspace-one-root-file.md)).

   ```bash
   ln -s ../../.env.local .env
   ```

2. **Set the Foundry variables** listed in `.env.example` in the root
   `.env.local`: `BASE_SEPOLIA_RPC_URL` and `ETHERSCAN_API_KEY`.

3. **Create the deployer account** and import it into an encrypted keystore.
   Keep an offline backup of its private key.

   ```bash
   cast wallet new                                     # generates an address and private key
   cast wallet import verisci-deployer --interactive   # encrypts the key under a password
   cast wallet address --account verisci-deployer      # prints the deployer address
   ```

4. **Fund the deployer** with Base Sepolia ETH from a faucet. A single faucet
   allocation covers a deployment.

### Deploying an environment

The steps below deploy staging; for production, use `production` and
`PRODUCTION_ORACLE`.

1. **Create the oracle account** with `cast wallet new`, and store its private
   key securely. Only its address is committed.
2. **Configure the oracle** by setting `STAGING_ORACLE` in
   `script/HelperConfig.s.sol` to its address, on a branch. While the constant
   is zero, the deployment reverts with `ZeroAddress` before any transaction
   is sent.
3. **Simulate** the deployment against Base Sepolia. Without `--broadcast`,
   the run stays a local simulation:

   ```bash
   DEPLOY_ENV=staging forge script script/DeployRatingController.s.sol \
     --rpc-url base_sepolia --account verisci-deployer
   ```

4. **Deploy** and verify the source on Basescan:

   ```bash
   DEPLOY_ENV=staging forge script script/DeployRatingController.s.sol \
     --rpc-url base_sepolia --account verisci-deployer --broadcast --verify
   ```

5. **Record** the deployment in `deployments/base-sepolia.json`:

   ```bash
   pnpm --filter @verisci/contracts record-deployment staging
   ```

6. **Commit** `script/HelperConfig.s.sol` and `deployments/base-sepolia.json`,
   and open a pull request into `develop`.

`DEPLOY_ENV` is passed on each command, so every deployment names its target
explicitly; when it is missing, `HelperConfig`
reverts with `UnknownDeployEnv`. Without `--rpc-url`, the script deploys to an
in-memory chain with the local Anvil configuration.

### How the scripts fit together

- `script/HelperConfig.s.sol` holds the constructor arguments of each
  environment: local Anvil (chain id 31337), and staging and production on
  Base Sepolia, selected by `DEPLOY_ENV`.
- `script/DeployRatingController.s.sol` deploys from that configuration. The
  account that signs the broadcast becomes the owner. The Foundry test suites
  deploy through the same script.
- `record-deployment` reads the run file written by `--broadcast`
  (`broadcast/DeployRatingController.s.sol/84532/run-latest.json`). The new
  contract becomes the environment's `current` deployment, and the previous
  one moves to the front of `past`. A dry run, another chain or an address
  already recorded is rejected, and the file is left unchanged
  ([ADR 0028](../../docs/adr/0028-deployed-addresses-are-committed.md)).

### Redeploying

After a redeploy, pause the previous contract. It stops accepting requests
while the oracle settles those still pending
([ADR 0023](../../docs/adr/0023-a-fix-is-a-redeploy-owner-powers-fixed.md)).

```bash
cast send <previous address> "pause()" --rpc-url base_sepolia --account verisci-deployer
```

## TypeScript API

| Export | Description |
| --- | --- |
| `ratingControllerAbi` | The contract ABI, typed `as const` so viem infers every function, event and error |
| `ratingControllerDeployments(appEnv)` | `{ chainId, current, past }` for `staging` or `production`; `local` resolves to staging ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)). `current` accepts new requests; `past` contracts are paused and drained ([ADR 0023](../../docs/adr/0023-a-fix-is-a-redeploy-owner-powers-fixed.md)) |
| `NoDeploymentError` | Thrown by `ratingControllerDeployments` for an environment with no current deployment |
| `Deployment`, `DeployEnv`, `RatingControllerDeployments` | The corresponding types |
| `contractsName` | The package name, listed on the web app's home page |

Each `Deployment` records the contract `address`, the deployment `txHash` and
`blockNumber`, the `owner`, `oracleAgent` and `maxPendingPerRequester` at
deployment time, and the git `commit` deployed. The owner can update the
oracle and the cap afterwards; the contract holds their current values.

`deployments/base-sepolia.json` is validated on import, so a malformed file
fails every importer with the invalid field named.

## Depends on

`@verisci/core`, `@verisci/env`

## Layout

```text
src/            # Solidity contracts and the TypeScript API (index.ts, deployments)
src/interfaces/ # contract interfaces: types, events, errors, NatSpec
src/generated/  # generated, committed: the typed ABI
script/         # Foundry scripts: HelperConfig, DeployRatingController
test/           # Foundry tests: *.t.sol unit and fuzz, *.inv.t.sol invariants, handlers/
tools/          # Node scripts: generate-abi, record-deployment, with their Vitest tests
deployments/    # generated, committed: deployed addresses per environment
foundry.toml    # compiler, fuzz and invariant profiles, Base Sepolia RPC and Basescan
.env            # local link to the root .env.local, read by forge (gitignored)
soldeer.lock    # pinned Solidity dependencies
remappings.txt  # maintained by hand: one line per dependency → dependencies/<name>-<version>/
```

### Generated files

`out/`, `cache/`, `dependencies/` and `broadcast/` are generated and
gitignored. `src/generated/` and `deployments/` are generated and committed:
Vercel builds without Foundry, and deployed addresses are reviewed in pull
requests. Both are written by tooling only.

- **ABI.** After changing a contract's interface, run
  `pnpm --filter @verisci/contracts generate:abi` and commit the result. CI
  regenerates the file and fails on any difference. Biome skips
  `src/generated/`.
- **Deployments.** `deployments/base-sepolia.json` changes only through
  `record-deployment`.

## Toolchain

| Tool | Version | Pinned in |
| --- | --- | --- |
| Foundry | 1.8.4 | `.github/workflows/ci.yml` (`foundry-toolchain`); install locally with `foundryup --install 1.8.4` |
| solc | 0.8.37 | `foundry.toml` (`solc_version`) |
| forge-std | 1.17.0 | `foundry.toml` `[dependencies]` and `soldeer.lock`, via Soldeer |
| OpenZeppelin Contracts | 5.7.0 | `foundry.toml` `[dependencies]` and `soldeer.lock`, via Soldeer |
| solhint | 6.2.4 | `package.json` |

To bump a dependency, run `forge soldeer install <name>~<version>`
(`forge-std`, `@openzeppelin-contracts`), then update its path in
`remappings.txt`.

## NatSpec and lint

Every contract, interface, library and script carries `@title` and `@notice`.
Every public or external function, event and error carries `@notice`,
`@param` and `@return`, or `@inheritdoc`. solhint's `use-natspec` rule
enforces this in `pnpm check`; it is the only solhint rule enabled, so it
complements `forge fmt` and `forge lint`.

`forge lint --deny notes` runs in `pnpm check` and after every `.sol` edit, and
fails on any warning or note
([ADR 0025](../../docs/adr/0025-reviews-gate-on-adrs-and-lint.md)). It covers
`src/`, `script/` and `test/`. `foundry.toml` enables all five severities
(high, medium, low, info, gas) and excludes `asm-keccak256`, which trades
readability for a small gas saving. To accept a single finding, add
`// forge-lint: disable-next-line(<lint-id>)` above the line, with a comment
giving the reason.

## Scripts

| Command | Description |
| --- | --- |
| `forge soldeer install` | Installs the Solidity dependencies from `soldeer.lock` |
| `pnpm --filter @verisci/contracts check` | `forge fmt --check`, `forge lint --deny notes`, then solhint NatSpec on `src/` and `script/` |
| `pnpm --filter @verisci/contracts test` | Vitest for the TypeScript code, then `forge test` |
| `pnpm --filter @verisci/contracts typecheck` | Typechecks the TypeScript code |
| `pnpm --filter @verisci/contracts generate:abi` | Runs `forge build`, then writes `src/generated/rating-controller-abi.ts` |
| `pnpm --filter @verisci/contracts record-deployment <staging\|production>` | Records the latest Base Sepolia broadcast in `deployments/base-sepolia.json` |
| `forge build --sizes` | Compiles and reports contract sizes |
| `forge coverage` | Reports Solidity test coverage per file |
| `FOUNDRY_PROFILE=ci forge test` | Runs the tests with the CI fuzz and invariant settings |

The TypeScript code ships as source (`src/index.ts`), with no build step. The
tools run under Node's type stripping; `erasableSyntaxOnly` in `tsconfig.json`
restricts the package to syntax Node can strip.
