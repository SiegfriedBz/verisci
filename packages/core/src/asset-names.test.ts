import fc from "fast-check";
import { base36 } from "multiformats/bases/base36";
import { base58btc } from "multiformats/bases/base58";
import { CID } from "multiformats/cid";
import * as Digest from "multiformats/hashes/digest";
import { describe, expect, it } from "vitest";
import { rKaName, targetKaName } from "./asset-names.ts";

const SHA2_256 = 0x12;
const RAW = 0x55;
const DAG_PB = 0x70;

const REQUEST_ID = `0x${"ab12".repeat(16)}`;
const DIGEST = Digest.create(
  SHA2_256,
  new Uint8Array(32).map((_, i) => i),
);
const RAW_CID = CID.createV1(RAW, DIGEST);
const V0_CID = CID.createV0(DIGEST);
const DAG_PB_CID = CID.createV1(DAG_PB, DIGEST);

/** The daemon's assertion-name rules plus our own: lowercase, never read as a KA id. */
function isDaemonSafe(name: string): boolean {
  return (
    /^[a-z0-9-]{1,256}$/.test(name) &&
    !name.startsWith("did:dkg:") &&
    !/^0x[0-9a-f]{40}:[0-9]+$/.test(name)
  );
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("rKaName", () => {
  it("names a lowercase request id verisci-rka-<id>", () => {
    expect(rKaName(REQUEST_ID)).toEqual({ ok: true, name: `verisci-rka-${REQUEST_ID}` });
  });

  it("gives the same name for an uppercase or mixed-case id, 0X prefix included", () => {
    const expected = rKaName(REQUEST_ID);
    expect(rKaName(`0X${REQUEST_ID.slice(2).toUpperCase()}`)).toEqual(expected);
    expect(rKaName(`0x${"Ab12".repeat(16)}`)).toEqual(expected);
  });

  it("trims surrounding whitespace", () => {
    expect(rKaName(`  ${REQUEST_ID}\n`)).toEqual(rKaName(REQUEST_ID));
  });

  it.each([
    ["empty", ""],
    ["63 hex digits", REQUEST_ID.slice(0, -1)],
    ["65 hex digits", `${REQUEST_ID}0`],
    ["a non-hex character", `${REQUEST_ID.slice(0, -1)}g`],
    ["no 0x prefix", REQUEST_ID.slice(2)],
  ])("refuses %s as bad-request-id", (_, input) => {
    expect(rKaName(input)).toEqual({ ok: false, reason: "bad-request-id" });
  });
});

describe("targetKaName", () => {
  it("names a CIDv1 base32 verisci-tka-<cid>", () => {
    expect(targetKaName(RAW_CID.toString())).toEqual({
      ok: true,
      name: `verisci-tka-${RAW_CID.toString()}`,
    });
  });

  it("gives a CIDv0 the same name as its CIDv1", () => {
    expect(V0_CID.toString()).toMatch(/^Qm/);
    expect(targetKaName(V0_CID.toString())).toEqual(targetKaName(DAG_PB_CID.toString()));
  });

  it("gives base58btc and base36 spellings the same name as base32", () => {
    const expected = targetKaName(RAW_CID.toString());
    expect(targetKaName(RAW_CID.toString(base58btc))).toEqual(expected);
    expect(targetKaName(RAW_CID.toString(base36))).toEqual(expected);
  });

  it("gives raw and dag-pb CIDs of the same digest different names", () => {
    expect(RAW_CID.toString()).toMatch(/^bafkrei/);
    expect(DAG_PB_CID.toString()).toMatch(/^bafybei/);
    expect(targetKaName(RAW_CID.toString())).not.toEqual(targetKaName(DAG_PB_CID.toString()));
  });

  it("trims surrounding whitespace", () => {
    expect(targetKaName(`  ${RAW_CID.toString()}\n`)).toEqual(targetKaName(RAW_CID.toString()));
  });

  it.each([
    ["empty", ""],
    ["not a CID", "not-a-cid"],
    ["a truncated CID", RAW_CID.toString().slice(0, 20)],
    ["an uppercase base32 CID", RAW_CID.toString().toUpperCase()],
  ])("refuses %s as bad-cid", (_, input) => {
    expect(targetKaName(input)).toEqual({ ok: false, reason: "bad-cid" });
  });
});

describe("asset name properties", () => {
  const bytes32 = fc.uint8Array({ minLength: 32, maxLength: 32 });

  it("gives names the daemon accepts and never reads as a KA id", () => {
    fc.assert(
      fc.property(bytes32, bytes32, (id, digest) => {
        const rKa = rKaName(`0x${hex(id)}`);
        const tKa = targetKaName(CID.createV1(RAW, Digest.create(SHA2_256, digest)).toString());
        if (!rKa.ok || !tKa.ok) return false;
        return isDaemonSafe(rKa.name) && isDaemonSafe(tKa.name);
      }),
    );
  });

  it("never gives an R-KA and a Target KA the same name", () => {
    fc.assert(
      fc.property(bytes32, bytes32, (id, digest) => {
        const rKa = rKaName(`0x${hex(id)}`);
        const tKa = targetKaName(CID.createV1(RAW, Digest.create(SHA2_256, digest)).toString());
        return rKa.ok && tKa.ok && rKa.name !== tKa.name;
      }),
    );
  });

  it("gives every accepted spelling of one input the same name", () => {
    fc.assert(
      fc.property(bytes32, bytes32, (id, digest) => {
        const lower = `0x${hex(id)}`;
        const sameRKa =
          JSON.stringify(rKaName(lower)) === JSON.stringify(rKaName(lower.toUpperCase()));
        const d = Digest.create(SHA2_256, digest);
        const v1 = CID.createV1(DAG_PB, d);
        const spellings = [
          CID.createV0(d).toString(),
          v1.toString(base58btc),
          v1.toString(base36),
          ` ${v1.toString()} `,
        ];
        const expected = JSON.stringify(targetKaName(v1.toString()));
        return sameRKa && spellings.every((s) => JSON.stringify(targetKaName(s)) === expected);
      }),
    );
  });
});
