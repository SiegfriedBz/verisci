/**
 * A parsed DKG UAL: `did:dkg:<blockchain>:<chainId>/<address>/<id>`.
 *
 * V10 has two shapes (`docs/domain.md`): the middle segment is either the author's address
 * or the KnowledgeAssets contract's. The string cannot tell them apart, so `address` is
 * kept as given, lowercased, with no claim about which one it is.
 */
export interface Ual {
  /** Blockchain name, lowercase, e.g. `base`. */
  readonly blockchain: string;
  /** Numeric chain id, e.g. 84532 for Base Sepolia. */
  readonly chainId: number;
  /** Author or KnowledgeAssets contract address, lowercase. */
  readonly address: `0x${string}`;
  /** KA number or KA id, a uint256. */
  readonly id: bigint;
}

/** Why a string is not a UAL. */
export type UalError =
  | "empty"
  | "not-a-dkg-did"
  | "bad-chain"
  | "bad-address"
  | "bad-id"
  | "bad-shape";

/** The result of {@link parseUal}. */
export type ParseUalResult =
  | { readonly ok: true; readonly ual: Ual }
  | { readonly ok: false; readonly reason: UalError };

/** The result of {@link normalizeUal}: the canonical string, or why the input is not a UAL. */
export type NormalizeUalResult =
  | { readonly ok: true; readonly ual: string }
  | { readonly ok: false; readonly reason: UalError };

const PREFIX = "did:dkg:";
const MAX_U256 = 2n ** 256n - 1n;
/** Digits in 2^256 − 1; a longer id is refused before `BigInt` parses it. */
const MAX_U256_DIGITS = 78;
/** Lowercase name, optionally namespaced with colons, as OriginTrail's canonical chain ids are. */
const BLOCKCHAIN = /^[a-z][a-z0-9-]*(?::[a-z0-9-]+)*$/;
/** A decimal integer with no sign and no leading zero, so each value has one spelling. */
const CANONICAL_DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;

/**
 * Parses a UAL string. Accepts any case for the prefix, blockchain name and address, and
 * surrounding whitespace; refuses leading zeros, so every accepted string has exactly one
 * canonical form ({@link formatUal}). Never throws.
 *
 * It does not decide whether the UAL can be rated (which chain, whose node): that is the
 * rating workflow's call.
 */
export function parseUal(input: string): ParseUalResult {
  const trimmed = input.trim();
  if (trimmed === "") return fail("empty");
  if (trimmed.slice(0, PREFIX.length).toLowerCase() !== PREFIX) return fail("not-a-dkg-did");

  const parts = trimmed.slice(PREFIX.length).split("/");
  if (parts.length !== 3) return fail("bad-shape");
  const [chain = "", rawAddress = "", rawId = ""] = parts;

  const separator = chain.lastIndexOf(":");
  const blockchain = chain.slice(0, separator).toLowerCase();
  const rawChainId = chain.slice(separator + 1);
  if (separator === -1 || !BLOCKCHAIN.test(blockchain) || !CANONICAL_DECIMAL.test(rawChainId)) {
    return fail("bad-chain");
  }
  const chainId = Number(rawChainId);
  if (!Number.isSafeInteger(chainId)) return fail("bad-chain");

  const address = rawAddress.toLowerCase();
  if (!ADDRESS.test(address)) return fail("bad-address");

  if (rawId.length > MAX_U256_DIGITS || !CANONICAL_DECIMAL.test(rawId)) return fail("bad-id");
  const id = BigInt(rawId);
  if (id > MAX_U256) return fail("bad-id");

  return { ok: true, ual: { blockchain, chainId, address: address as `0x${string}`, id } };
}

/**
 * Writes the canonical UAL string: lowercase blockchain and address, decimal id. Give it a
 * `Ual` from {@link parseUal}: it checks nothing, so a hand-built value with a bad field
 * gives a string `parseUal` refuses.
 */
export function formatUal(ual: Ual): string {
  return `${PREFIX}${ual.blockchain.toLowerCase()}:${ual.chainId}/${ual.address.toLowerCase()}/${ual.id}`;
}

/**
 * Returns the canonical spelling of a UAL, or why it is not one. Every UAL goes through this
 * before it reaches the contract, a DKG lookup or the UI (ADR 0031): the contract keys
 * ratings by the exact string, so two spellings would split one paper's ratings.
 */
export function normalizeUal(input: string): NormalizeUalResult {
  const parsed = parseUal(input);
  return parsed.ok ? { ok: true, ual: formatUal(parsed.ual) } : parsed;
}

/** True when both strings are valid UALs naming the same KA; false if either is invalid. */
export function isSameUal(a: string, b: string): boolean {
  const left = normalizeUal(a);
  const right = normalizeUal(b);
  return left.ok && right.ok && left.ual === right.ual;
}

function fail(reason: UalError): ParseUalResult {
  return { ok: false, reason };
}
