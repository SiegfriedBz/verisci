import { base36 } from "multiformats/bases/base36";
import { base58btc } from "multiformats/bases/base58";
import { CID } from "multiformats/cid";
import * as Digest from "multiformats/hashes/digest";
import { describe, expect, it } from "vitest";
import { canonicalCid } from "./cid.ts";

const SHA2_256 = 0x12;
const SHA2_512 = 0x13;
const RAW = 0x55;
const DAG_PB = 0x70;
const DAG_CBOR = 0x71;

const DIGEST = Digest.create(
  SHA2_256,
  new Uint8Array(32).map((_, i) => i),
);
const RAW_CID = CID.createV1(RAW, DIGEST);
const DAG_PB_CID = CID.createV1(DAG_PB, DIGEST);

describe("canonicalCid", () => {
  it("returns a CIDv1 base32 unchanged", () => {
    expect(canonicalCid(RAW_CID.toString())).toBe(RAW_CID.toString());
  });

  it("writes every spelling of one CID as CIDv1 base32", () => {
    const expected = DAG_PB_CID.toString();
    expect(canonicalCid(CID.createV0(DIGEST).toString())).toBe(expected);
    expect(canonicalCid(DAG_PB_CID.toString(base58btc))).toBe(expected);
    expect(canonicalCid(DAG_PB_CID.toString(base36))).toBe(expected);
  });

  it("trims surrounding whitespace", () => {
    expect(canonicalCid(` ${RAW_CID.toString()}\n`)).toBe(RAW_CID.toString());
  });

  it.each([
    ["empty", ""],
    ["not a CID", "hello"],
    ["uppercase base32", RAW_CID.toString().toUpperCase()],
    ["a dag-cbor CID", CID.createV1(DAG_CBOR, DIGEST).toString()],
    ["a sha2-512 CID", CID.createV1(RAW, Digest.create(SHA2_512, new Uint8Array(64))).toString()],
  ])("returns undefined for %s", (_, input) => {
    expect(canonicalCid(input)).toBeUndefined();
  });
});
