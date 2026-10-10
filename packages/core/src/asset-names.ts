import { canonicalCid } from "./cid.ts";

/** Why an input cannot be named: not a request id, or not a CID. */
export type AssetNameError = "bad-request-id" | "bad-cid";

/** The result of {@link rKaName} and {@link targetKaName}: the asset name, or why there is none. */
export type AssetNameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: AssetNameError };

const R_KA_PREFIX = "verisci-rka-";
const TARGET_KA_PREFIX = "verisci-tka-";
const REQUEST_ID = /^0x[0-9a-f]{64}$/;

/**
 * The DKG asset name of a rating's R-KA: `verisci-rka-<request id>`, the phase-1 request id
 * as `0x` + 64 lowercase hex (ADR 0016). The id hashes the chain id and contract address, so
 * each deployment's requests have their own names. Later phases keep this name (ADR 0011).
 *
 * Accepts any case and surrounding whitespace. Returns a result for every input.
 */
export function rKaName(requestId: string): AssetNameResult {
  const id = requestId.trim().toLowerCase();
  if (!REQUEST_ID.test(id)) return { ok: false, reason: "bad-request-id" };
  return { ok: true, name: `${R_KA_PREFIX}${id}` };
}

/**
 * The DKG asset name of a paper's Target KA: `verisci-tka-<CIDv1 base32>` (ADR 0010). The
 * daemon scopes names per context graph, so the same PDF in staging and production is two
 * assets.
 *
 * Accepts the CIDs {@link canonicalCid} accepts, so every name is 71 characters. Every
 * spelling of one CID (v0 `Qm…`, v1 in base32 `b…`, base58btc `z…` or base36 `k…`) gives
 * one name. The codec is part of the CID:
 * the same bytes uploaded as a raw block and as a UnixFS file are two CIDs, so two names
 * (`docs/domain.md` → IPFS).
 *
 * Accepts surrounding whitespace. Returns a result for every input.
 */
export function targetKaName(cid: string): AssetNameResult {
  const canonical = canonicalCid(cid);
  if (canonical === undefined) return { ok: false, reason: "bad-cid" };
  return { ok: true, name: `${TARGET_KA_PREFIX}${canonical}` };
}
