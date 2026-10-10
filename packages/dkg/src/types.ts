/** One triple of a Knowledge Asset, as the node takes it: IRIs bare, literals quoted (`"\"7\""`). */
export interface Quad {
  readonly subject: string;
  readonly predicate: string;
  readonly object: string;
}

/**
 * Where an asset stands on the node (`docs/domain.md` → DKG):
 * - `missing`: never stored under this name in this graph;
 * - `draft`: sealed in working memory but not shared, so not ready to mint;
 * - `stored`: shared, ready to mint; `reservedUal` is the UAL it will have once minted;
 * - `minted`: published on chain under `ual`.
 */
export type AssetState =
  | { readonly state: "missing" }
  | { readonly state: "draft" }
  | { readonly state: "stored"; readonly reservedUal: string }
  | { readonly state: "minted"; readonly ual: string };

/**
 * Why a call did not succeed:
 * - `unreachable`: no answer from the node (down, network error or timeout);
 * - `unauthorized`: the node refused the token (401 or 403);
 * - `graph-not-served`: the node does not serve the context graph (not subscribed, or
 *   dropped from its config after a restart), so no asset in it can be read or written;
 * - `not-stored`: a mint was asked for an asset that is not stored and shared yet;
 * - `retry-later`: the network could not take the mint now (quorum); retry after a pause;
 * - `no-content`: a store found no asset to share and was given no quads to create one;
 * - `unexpected`: any other answer, with its HTTP status and the node's error code if any.
 *
 * Never carries the token.
 */
export interface DkgFailure {
  readonly ok: false;
  readonly reason:
    | "unreachable"
    | "unauthorized"
    | "graph-not-served"
    | "not-stored"
    | "retry-later"
    | "no-content"
    | "unexpected";
  readonly status?: number;
  readonly code?: string;
}

/** The result of `readAsset` and `storeAsset`: the asset's state, or why the call failed. */
export type AssetResult = ({ readonly ok: true } & AssetState) | DkgFailure;

/** The result of `query`: the SPARQL answer's rows, each a map of variable to term. */
export type QueryResult =
  | { readonly ok: true; readonly bindings: readonly Readonly<Record<string, string>>[] }
  | DkgFailure;

/** The result of `startMint`: minted with its UAL, a mint in flight to poll, or why it failed. */
export type MintResult =
  | { readonly ok: true; readonly state: "minted"; readonly ual: string }
  | { readonly ok: true; readonly state: "minting" }
  | DkgFailure;
