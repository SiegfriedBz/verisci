# @verisci/contracts

Solidity contracts (Foundry), plus the TypeScript side that the other
workspaces import.

Status: `RatingController` v2, written and tested.

## RatingController

Records phase-1 rating requests on chain and the oracle's answers. Its public
API (types, events, errors and function signatures, with their NatSpec) is
`src/interfaces/IRatingController.sol`; `src/RatingController.sol` implements
it. A fix is a redeploy, and the app reads past deployments read-only
([ADR 0023](../../docs/adr/0023-contract-is-not-upgradeable.md)).

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
- **Admin.** The owner sets `oracleAgent` and `maxPendingPerRequester`.
  Ownership moves in two steps (OpenZeppelin `Ownable2Step`:
  `transferOwnership`, then `acceptOwnership`), and the contract always has an
  owner: `renounceOwnership` reverts with `RenounceOwnershipDisabled`.

Failures revert with custom errors, and every state change emits an event
(`Phase1Requested`, `Phase1Fulfilled`, `RequestCancelled`,
`OracleAgentUpdated`, `MaxPendingPerRequesterUpdated`).

### Life of a request

```text
                 requestPhase1 (anyone)
                         │  checks: UAL not empty, under the cap
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

   owner: setOracleAgent, setMaxPendingPerRequester, two-step ownership transfer
```

## Depends on

`@verisci/core`, `@verisci/env`

## Layout

```text
src/            # .sol contracts (Foundry) and index.ts (TypeScript side)
src/interfaces/ # contract interfaces: types, events, errors, NatSpec
test/           # Foundry tests: *.t.sol unit and fuzz, *.inv.t.sol invariants, handlers/
foundry.toml    # compiler, fuzz and invariant profiles
soldeer.lock    # pinned Solidity dependencies
remappings.txt  # written by hand: one line per dependency → dependencies/<name>-<version>/
```

`out/`, `cache/` and `dependencies/` are generated and gitignored.

Also generated, once they exist: `broadcast/` (written by `forge script --broadcast`),
`deployments/` (deployed addresses per network) and `src/generated/` (TypeScript bindings
from the build). Never edit them by hand: change the `.sol` source or the script, then
rerun the build or the deploy script that writes them. The plan that adds each one documents
its exact command here.

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

Every contract, interface and library needs `@title` and `@notice`. Every
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
| `pnpm --filter @verisci/contracts check` | `forge fmt --check`, then `forge lint --deny notes`, then solhint NatSpec (skipped while `src/` has no `.sol` files) |
| `pnpm --filter @verisci/contracts test` | Vitest for the TypeScript side, then `forge test` |
| `pnpm --filter @verisci/contracts typecheck` | Typechecks the TypeScript side |
| `forge build --sizes` | Compiles and reports contract sizes |
| `FOUNDRY_PROFILE=ci forge test` | Tests with the CI fuzz and invariant runs |

The TypeScript side ships as source (`src/index.ts`), with no build step.
