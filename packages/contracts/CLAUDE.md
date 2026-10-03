# packages/contracts

Solidity contracts (Foundry) plus their TypeScript side. See `README.md` here for the
layout, toolchain versions and commands.

- `src/*.sol` contracts, `test/*.t.sol` tests, `script/*.s.sol` scripts; `src/index.ts`
  is the TypeScript side, which may import `@verisci/core` and `@verisci/env` only.
- Every contract, interface and library: `@title` and `@notice`. Every public or external
  function, event and error: `@notice`, `@param`, `@return`, or `@inheritdoc`. solhint
  fails `pnpm check` otherwise.
- Dependencies via Soldeer (`forge soldeer install`), never `forge install` or git
  submodules. After bumping one, update the path in `remappings.txt` by hand.
- Fuzz-test every function that takes input; the `ci` profile runs 5000 fuzz runs.
- Never broadcast or deploy (`forge script --broadcast`, `forge create`, `cast send`):
  deploying is the user's call.
- `out/`, `cache/`, `dependencies/`, `soldeer.lock` and future `broadcast/`,
  `deployments/`, `src/generated/` are generated; change the source and regenerate.
- `Counter` is a placeholder: replace it with the first real contract.
- The rating contract follows ADRs 0012 (one score per phase), 0015 (per-requester cap),
  0016 (request id scheme) and 0020 (pending set, cancel reasons). See
  [`docs/adr/`](../../docs/adr/README.md).
