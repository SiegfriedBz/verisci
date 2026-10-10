import { describe, expect, it } from "vitest";
import { addressUrl } from "./explorer.ts";

describe("addressUrl", () => {
  it("links an address on Base Sepolia's Basescan, lowercase", () => {
    expect(addressUrl("0xD701ed157232ad5E14BC4134a8D10D64D86f13B3")).toBe(
      "https://sepolia.basescan.org/address/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
    );
  });
});
