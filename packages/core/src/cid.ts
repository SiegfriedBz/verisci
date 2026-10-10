import { CID } from "multiformats/cid";

/** The hash, digest length and codecs of the CIDs an IPFS upload of a file produces. */
const SHA2_256 = 0x12;
const SHA2_256_BYTES = 32;
const RAW = 0x55;
const DAG_PB = 0x70;

/**
 * A PDF's CID in its one canonical spelling, CIDv1 base32: the spelling a submission signs
 * and a Target KA is named from (ADR 0010).
 *
 * Accepts the CIDs an IPFS upload of a file produces: a sha2-256 digest with the raw or
 * dag-pb codec. Every spelling of one CID (v0 `Qm…`, v1 in base32 `b…`, base58btc `z…` or
 * base36 `k…`) gives one result; any other input gives `undefined`. Accepts surrounding
 * whitespace. Pure, so the browser canonicalizes before asking for a signature.
 */
export function canonicalCid(cid: string): string | undefined {
  let parsed: CID;
  try {
    parsed = CID.parse(cid.trim());
  } catch {
    return undefined;
  }
  const { code, size } = parsed.multihash;
  if (
    code !== SHA2_256 ||
    size !== SHA2_256_BYTES ||
    (parsed.code !== RAW && parsed.code !== DAG_PB)
  ) {
    return undefined;
  }
  return parsed.toV1().toString();
}
