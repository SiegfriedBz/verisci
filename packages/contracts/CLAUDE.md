# packages/contracts

Solidity contracts (Foundry) plus their TypeScript side. See `README.md` here for the
layout, toolchain versions and commands.

- `src/*.sol` contracts, `test/*.t.sol` tests, `script/*.s.sol` scripts; `src/index.ts`
  is the TypeScript side, which may import `@verisci/core` and `@verisci/env` only.
- Every contract, interface, library and script: `@title` and `@notice`. Every public or external
  function, event and error: `@notice`, `@param`, `@return`, or `@inheritdoc`. solhint
  fails `pnpm check` otherwise.
- `forge lint --deny notes` fails `pnpm check` and the edit hook on any warning or note (ADR 0025).
  Fix the finding, or accept one line with `// forge-lint: disable-next-line(<id>)` and a
  comment saying why.
- Dependencies via Soldeer (`forge soldeer install`), never `forge install` or git
  submodules. After bumping one, update the path in `remappings.txt` by hand.
- Fuzz-test every function that takes input; the `ci` profile runs 5000 fuzz runs.
- Never broadcast or deploy (`forge script --broadcast`, `forge create`, `cast send`):
  deploying is the user's call.
- `out/`, `cache/`, `dependencies/`, `soldeer.lock`, `broadcast/` and future
  `deployments/`, `src/generated/` are generated; change the source and regenerate.
- Tests deploy `RatingController` through `script/DeployRatingController.s.sol`, so they
  run the deploy path; only constructor tests call `new RatingController` directly.
  Per-environment settings live in `script/HelperConfig.s.sol`.
- Contracts follow the Solidity style guide's order of layout. Types, events and errors
  go in an interface (`src/interfaces/I<Name>.sol`) with their NatSpec; the contract
  implements it and uses `@inheritdoc`.
- `src/RatingController.sol` implements `IRatingController`. Its invariants live in
  `test/RatingController.inv.t.sol`, driven by `test/handlers/RatingHandler.sol`.
- It follows ADRs 0012 (one score per phase), 0015 (per-requester cap), 0016 (request id
  scheme), 0020 (pending set, cancel reasons), 0022 (request ids indexed by target), 0023
  (a fix is a redeploy), 0024 (only the oracle cancels) and 0027 (the owner pauses new
  requests; fulfil and cancel keep working). See [`docs/adr/`](../../docs/adr/README.md).
