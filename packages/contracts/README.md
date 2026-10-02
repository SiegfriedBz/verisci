# @verisci/contracts

Solidity contracts (Foundry), plus the TypeScript side that the other
workspaces import.

Status: placeholder. `Counter` (contract, tests and deploy script) proves the
toolchain end to end; replace it with the first real contract.

## Depends on

`@verisci/core`, `@verisci/env`

## Layout

```text
src/            # .sol contracts (Foundry) and index.ts (TypeScript side)
test/           # Foundry tests, *.t.sol
script/         # Foundry scripts, *.s.sol
foundry.toml    # compiler, fuzz and invariant profiles
soldeer.lock    # pinned Solidity dependencies
remappings.txt  # written by hand: forge-std/ → dependencies/forge-std-<version>/src/
```

`out/`, `cache/` and `dependencies/` are generated and gitignored.

## Toolchain

| Tool | Version | Pinned in |
| --- | --- | --- |
| Foundry | 1.8.4 | `.github/workflows/ci.yml` (`foundry-toolchain`); install locally with `foundryup --install 1.8.4` |
| solc | 0.8.37 | `foundry.toml` (`solc_version`) |
| forge-std | 1.17.0 | `foundry.toml` `[dependencies]` and `soldeer.lock`, via Soldeer |
| solhint | 6.2.4 | `package.json` |

To bump forge-std: `forge soldeer install forge-std~<version>`, then update
the path in `remappings.txt`.

## NatSpec

Every contract, interface and library needs `@title` and `@notice`. Every
public or external function, event and error needs `@notice`, `@param` and
`@return`, or `@inheritdoc`. solhint's `use-natspec` rule enforces this at
`error` in `pnpm check`; it is the only solhint rule enabled, so it does not
overlap with `forge fmt`.

## Scripts

| Command | What it does |
| --- | --- |
| `forge soldeer install` | Installs the Solidity dependencies from `soldeer.lock` |
| `pnpm --filter @verisci/contracts check` | `forge fmt --check`, then solhint NatSpec (skipped while `src/` has no `.sol` files) |
| `pnpm --filter @verisci/contracts test` | Vitest for the TypeScript side, then `forge test` |
| `pnpm --filter @verisci/contracts typecheck` | Typechecks the TypeScript side |
| `forge build --sizes` | Compiles and reports contract sizes |
| `FOUNDRY_PROFILE=ci forge test` | Tests with the CI fuzz and invariant runs |
| `forge script script/Counter.s.sol` | Dry-runs the deploy script (add `--rpc-url` and `--broadcast` to deploy) |

The TypeScript side ships as source (`src/index.ts`), with no build step.
