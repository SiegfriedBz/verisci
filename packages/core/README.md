# @verisci/core

Domain logic. Core does no IO: no `fetch`, no `node:*` imports and no other
`@verisci/*` package. IO belongs in an adapter package such as `dkg` or
`contracts`.

`pnpm check` enforces this: `packages/core/biome.json` turns `fetch`,
`node:*` and `@verisci/*` into errors ("core does no IO").

Status: shared constants and UAL parsing.

## API

| Export | Description |
| --- | --- |
| `coreName` | The package name, listed on the web app's home page |
| `BASE_SEPOLIA_CHAIN_ID` | 84532, the chain id of Base Sepolia, where staging and production run and which UALs reference ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)) |
| `parseUal(input)` | Parses a UAL into a `Ual` (`blockchain`, `chainId`, lowercase `address`, `bigint` `id`), or returns `{ ok: false, reason }` with a `UalError`; never throws |
| `formatUal(ual)` | Writes a `Ual` from `parseUal` as its canonical string |
| `normalizeUal(input)` | The canonical string for any accepted spelling, or the parse failure |
| `isSameUal(a, b)` | True when both are valid UALs naming the same KA |
| `Ual` | A parsed UAL: `blockchain`, `chainId`, lowercase `address`, `bigint` `id` |
| `UalError` | Why a string is not a UAL: `empty`, `not-a-dkg-did`, `bad-chain`, `bad-address`, `bad-id`, `bad-shape` |
| `ParseUalResult`, `NormalizeUalResult` | The results of `parseUal` and `normalizeUal` |

## UALs

A UAL names a Knowledge Asset on the DKG: `did:dkg:<blockchain>:<chainId>/<address>/<id>`.
Normalize every UAL with `normalizeUal` before it reaches the contract, a DKG lookup or the
UI ([ADR 0031](../../docs/adr/0031-uals-are-normalized-before-the-contract.md)): the
contract lists ratings under the exact string, so two spellings of one UAL would split its
ratings.

- **Accepted and rewritten:** surrounding whitespace, any case in the `did:dkg:` prefix, the
  blockchain name and the address (`0X` included).
- **Refused:** a chain id or id with a leading zero, a chain id above
  `Number.MAX_SAFE_INTEGER`, an id above 2^256 − 1 (78 digits at most), and any other shape.
- **The oracle cancels** a rating request whose target is not in canonical form, since the
  contract stores the string as given.
- **Both V10 shapes** parse (`docs/domain.md`): `address` is the author's or the
  KnowledgeAssets contract's, which the string cannot tell apart.
- Whether a UAL can be rated (its chain, its node) is the rating workflow's call, not the
  parser's.

## Depends on

No other workspace. pnpm does not hoist undeclared workspace packages, so an
import of another `@verisci/*` package fails to typecheck.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/core typecheck` | Typechecks the package |
| `pnpm --filter @verisci/core test` | Runs its Vitest project (`vitest run`) |

Ships TypeScript source (`src/index.ts`), with no build step.
