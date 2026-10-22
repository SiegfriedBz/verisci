# packages/core

Pure domain logic. See `README.md` here.

- **No IO**: no `fetch`, no `node:*` imports, no other `@labstrail/*` package. Biome fails
  `pnpm check` on any of them ("core does no IO"). Inject data instead; IO belongs in
  `dkg`, `contracts` or `workflows`.
- Coverage threshold is 90% branches, the strictest in the repo: test every branch.
- Pure functions and plain data types; no classes holding hidden state.
- **Third-party runtime dependencies** only when pure code with no IO, pinned exactly.
  Biome checks core's own imports, not what a library does inside, so read a library
  before adding it, and import only its pure subpaths. From `multiformats`, core uses
  `multiformats/cid`, `multiformats/bases/*` and `multiformats/hashes/digest`;
  `multiformats/hashes/sha1` and `multiformats/hashes/sha2` load `node:crypto`. From
  `@xmldom/xmldom` (pure JS, no dependencies), core uses `DOMParser`. From `zod`, core uses
  its schemas, to check the scorer's and the field check's answers (`parseScorerAnswer`,
  `parseFieldAnswer`).
- **Layout:** source sits in feature folders: `assets/` (UALs, asset and graph names, CIDs,
  chains, OriginTrail's contracts: what every feature addresses), `publish/` (the signed
  submission, the TEI header, the title's completion, the Target KA, the field check), `papers/` (a published record and the list),
  `rating/` (the paper's text, checklists, scorer, R-KA); `fixtures/` holds test data. Only
  `index.ts`, which exports everything, sits at the root. A feature may import from
  another's folder (papers and rating build on the Target KA's predicates in `publish/`,
  rating reads SPARQL rows with `papers/`, the field check defines the field with the
  scorer's `FIELD_RULE` in `rating/`); what addresses things for every feature goes in
  `assets/`. `src/layout.test.ts` checks that each file sits in one of these folders and that
  the entry exports the same names.
