# @verisci/core

Domain logic. Core does no IO: no `fetch`, no `node:*` imports and no other
`@verisci/*` package. IO belongs in an adapter package such as `dkg` or
`contracts`.

`pnpm check` enforces this: `packages/core/biome.json` turns `fetch`,
`node:*` and `@verisci/*` into errors ("core does no IO").

Status: shared constants, UAL parsing and asset names.

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
| `rKaName(requestId)` | The R-KA's asset name, `verisci-rka-<request id>`, or `{ ok: false, reason: "bad-request-id" }`; returns a result for every input |
| `targetKaName(cid)` | The Target KA's asset name, `verisci-tka-<CIDv1 base32>`, or `{ ok: false, reason: "bad-cid" }`; returns a result for every input |
| `AssetNameResult`, `AssetNameError` | The result of both, and why an input cannot be named |

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

## Asset names

Every write to the DKG stores an asset under a name computed from data every process
already has, so a retried store or mint finds the asset an earlier attempt created
([ADR 0007](../../docs/adr/0007-all-writes-converge.md)). Any process recomputes a name
from the request id or the CID.

- **R-KA:** `verisci-rka-<request id>`, the phase-1 request id as `0x` + 64 lowercase hex
  ([ADR 0016](../../docs/adr/0016-asset-names-derive-from-request-id.md)). Any case and
  surrounding whitespace give the same name.
- **Target KA:** `verisci-tka-<CIDv1 base32>`
  ([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)), from the CIDs an IPFS
  upload of a file produces: a sha2-256 digest with the raw or dag-pb codec. Every spelling
  of one CID (`Qm…`, `b…`, `z…`, `k…`) gives the same name; uppercase base32 (`B…`), other
  hashes and other codecs are `bad-cid`. The same bytes uploaded with other import settings
  are another CID, so another name (`docs/domain.md` → IPFS).
- **Scope:** a name holds only its prefix and the request id or CID. The daemon scopes
  names per context graph, so each environment's graph holds its own asset
  (`docs/domain.md` → DKG).
- Every name is lowercase `[a-z0-9-]`, 78 characters for an R-KA and 71 for a Target KA,
  within the daemon's 1 to 256 and with no `:`, so the daemon reads it as a name.

## Depends on

The `multiformats` library, to parse CIDs, and no other workspace. pnpm does not hoist
undeclared workspace packages, so an import of another `@verisci/*` package fails to
typecheck.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/core typecheck` | Typechecks the package |
| `pnpm --filter @verisci/core test` | Runs its Vitest project (`vitest run`) |

Ships TypeScript source (`src/index.ts`), with no build step.
