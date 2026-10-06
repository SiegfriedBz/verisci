import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatUal, isSameUal, normalizeUal, parseUal, type Ual } from "./ual.ts";

const ADDRESS = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
const CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const UAL = `did:dkg:base:84532/${ADDRESS}/42`;
const MAX_U256 = 2n ** 256n - 1n;

const expected: Ual = { blockchain: "base", chainId: 84_532, address: ADDRESS, id: 42n };

describe("parseUal", () => {
  it("parses a V10 UAL into its parts, address lowercase and id a bigint", () => {
    expect(parseUal(UAL)).toEqual({ ok: true, ual: expected });
  });

  it("parses a checksummed address to the same value", () => {
    expect(parseUal(`did:dkg:base:84532/${CHECKSUMMED}/42`)).toEqual({ ok: true, ual: expected });
  });

  it("trims surrounding whitespace", () => {
    expect(parseUal(`  ${UAL}\n`)).toEqual({ ok: true, ual: expected });
  });

  it("parses an uppercase prefix and blockchain name, with blockchain lowercased", () => {
    expect(parseUal(`DID:DKG:BASE:84532/${ADDRESS}/42`)).toEqual({ ok: true, ual: expected });
  });

  it("parses other blockchains and chain ids", () => {
    expect(parseUal(`did:dkg:otp:2043/${ADDRESS}/7`)).toEqual({
      ok: true,
      ual: { blockchain: "otp", chainId: 2043, address: ADDRESS, id: 7n },
    });
  });

  it("parses a namespaced blockchain name", () => {
    expect(parseUal(`did:dkg:evm:base:84532/${ADDRESS}/42`)).toEqual({
      ok: true,
      ual: { ...expected, blockchain: "evm:base" },
    });
  });

  it("parses an uppercase 0X address prefix", () => {
    expect(parseUal(`did:dkg:base:84532/0X${ADDRESS.slice(2).toUpperCase()}/42`)).toEqual({
      ok: true,
      ual: expected,
    });
  });

  it("parses id 0", () => {
    expect(parseUal(`did:dkg:base:84532/${ADDRESS}/0`)).toEqual({
      ok: true,
      ual: { ...expected, id: 0n },
    });
  });

  it("parses the largest uint256 id", () => {
    expect(parseUal(`did:dkg:base:84532/${ADDRESS}/${MAX_U256}`)).toEqual({
      ok: true,
      ual: { ...expected, id: MAX_U256 },
    });
  });

  it.each([
    ["an empty string", "", "empty"],
    ["whitespace only", "   ", "empty"],
    ["another DID method", `did:web:base:84532/${ADDRESS}/42`, "not-a-dkg-did"],
    ["a URL", "https://example.org/paper", "not-a-dkg-did"],
    ["no blockchain name", `did:dkg:84532/${ADDRESS}/42`, "bad-chain"],
    ["an empty chain id", `did:dkg:base:/${ADDRESS}/42`, "bad-chain"],
    ["a non-numeric chain id", `did:dkg:base:sepolia/${ADDRESS}/42`, "bad-chain"],
    ["a chain id with a leading zero", `did:dkg:base:084532/${ADDRESS}/42`, "bad-chain"],
    [
      "a chain id above the safe integer range",
      `did:dkg:base:9007199254740992/${ADDRESS}/42`,
      "bad-chain",
    ],
    ["a blockchain name with a bad character", `did:dkg:ba_se:84532/${ADDRESS}/42`, "bad-chain"],
    ["an address too short", "did:dkg:base:84532/0x1234/42", "bad-address"],
    ["an address without 0x", `did:dkg:base:84532/${ADDRESS.slice(2)}00/42`, "bad-address"],
    [
      "an address with a non-hex character",
      `did:dkg:base:84532/0x${"g".repeat(40)}/42`,
      "bad-address",
    ],
    ["a non-decimal id", `did:dkg:base:84532/${ADDRESS}/0x2a`, "bad-id"],
    ["a negative id", `did:dkg:base:84532/${ADDRESS}/-1`, "bad-id"],
    ["an empty id", `did:dkg:base:84532/${ADDRESS}/`, "bad-id"],
    ["an id with a leading zero", `did:dkg:base:84532/${ADDRESS}/042`, "bad-id"],
    [
      "an id longer than 78 digits",
      `did:dkg:base:84532/${ADDRESS}/${"9".repeat(100_000)}`,
      "bad-id",
    ],
    ["an id above uint256", `did:dkg:base:84532/${ADDRESS}/${MAX_U256 + 1n}`, "bad-id"],
    ["an extra segment", `${UAL}/1`, "bad-shape"],
    ["a missing segment", `did:dkg:base:84532/${ADDRESS}`, "bad-shape"],
  ] as const)("rejects %s", (_, input, reason) => {
    expect(parseUal(input)).toEqual({ ok: false, reason });
  });
});

describe("formatUal", () => {
  it("writes the canonical string", () => {
    expect(
      formatUal({ ...expected, blockchain: "Base", address: CHECKSUMMED as `0x${string}` }),
    ).toBe(UAL);
  });
});

describe("normalizeUal", () => {
  it("returns the canonical string for any accepted spelling", () => {
    expect(normalizeUal(`  DID:DKG:Base:84532/${CHECKSUMMED}/42 `)).toEqual({ ok: true, ual: UAL });
  });

  it("returns the parse failure", () => {
    expect(normalizeUal(`did:dkg:base:84532/${ADDRESS}/042`)).toEqual({
      ok: false,
      reason: "bad-id",
    });
  });
});

describe("isSameUal", () => {
  it("is true for two spellings of one UAL", () => {
    expect(isSameUal(UAL, ` did:dkg:BASE:84532/${CHECKSUMMED}/42`)).toBe(true);
  });

  it.each([
    ["ids", `did:dkg:base:84532/${ADDRESS}/43`],
    ["addresses", `did:dkg:base:84532/0x${"1".repeat(40)}/42`],
    ["chain ids", `did:dkg:base:8453/${ADDRESS}/42`],
    ["blockchains", `did:dkg:otp:84532/${ADDRESS}/42`],
  ])("is false for different %s", (_, other) => {
    expect(isSameUal(UAL, other)).toBe(false);
  });

  it("is false when either side is invalid", () => {
    expect(isSameUal(UAL, "")).toBe(false);
    expect(isSameUal("not a ual", UAL)).toBe(false);
    expect(isSameUal("not a ual", "not a ual")).toBe(false);
  });
});

const hexChar = fc.constantFrom(..."0123456789abcdefABCDEF");
const blockchainArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);
const ualArb = fc.record({
  blockchain: blockchainArb,
  chainId: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  address: fc
    .string({ unit: hexChar, minLength: 40, maxLength: 40 })
    .map((hex) => `0x${hex.toLowerCase()}` as const),
  id: fc.bigInt({ min: 0n, max: MAX_U256 }),
});
const spellingArb = fc.record({
  ual: ualArb,
  upperPrefix: fc.boolean(),
  upperChain: fc.boolean(),
  addressCase: fc.array(fc.boolean(), { minLength: 40, maxLength: 40 }),
  padding: fc.constantFrom("", " ", "\t", "\n "),
});

describe("properties", () => {
  it("parseUal(formatUal(ual)) returns that ual", () => {
    fc.assert(
      fc.property(ualArb, (ual) => {
        expect(parseUal(formatUal(ual))).toEqual({ ok: true, ual });
      }),
    );
  });

  it("normalizeUal is idempotent and agrees across spellings", () => {
    fc.assert(
      fc.property(spellingArb, ({ ual, upperPrefix, upperChain, addressCase, padding }) => {
        const hex = [...ual.address.slice(2)]
          .map((c, i) => (addressCase[i] ? c.toUpperCase() : c))
          .join("");
        const prefix = upperPrefix ? "DID:DKG:" : "did:dkg:";
        const chain = upperChain ? ual.blockchain.toUpperCase() : ual.blockchain;
        const spelled = `${padding}${prefix}${chain}:${ual.chainId}/0x${hex}/${ual.id}${padding}`;

        const once = normalizeUal(spelled);
        expect(once).toEqual({ ok: true, ual: formatUal(ual) });
        if (once.ok) expect(normalizeUal(once.ual)).toEqual(once);
        expect(isSameUal(spelled, formatUal(ual))).toBe(true);
      }),
    );
  });
});
