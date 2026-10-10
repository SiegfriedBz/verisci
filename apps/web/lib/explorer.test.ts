import { describe, expect, it } from "vitest";
import { addressUrl, assetTokenUrl, ipfsUrl } from "./explorer.ts";

describe("addressUrl", () => {
  it("links an address on Base Sepolia's Basescan, lowercase", () => {
    expect(addressUrl("0xD701ed157232ad5E14BC4134a8D10D64D86f13B3")).toBe(
      "https://sepolia.basescan.org/address/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
    );
  });
});

describe("assetTokenUrl", () => {
  it("links a paper's ERC-721 token in OriginTrail's KnowledgeAssets contract", () => {
    expect(assetTokenUrl("did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/8")).toBe(
      "https://sepolia.basescan.org/nft/0x2b2e1bcb7c52a1587264e01f6b53782d791e6fa0/97250665584536569906395019546324268771044027214492192272407200191098042449928",
    );
  });

  it("gives no link for a string that is not a UAL, or a chain with no known contracts", () => {
    expect(assetTokenUrl("not a ual")).toBeUndefined();
    expect(
      assetTokenUrl("did:dkg:base:8453/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/8"),
    ).toBeUndefined();
  });
});

describe("ipfsUrl", () => {
  it("downloads a CID through Pinata's public gateway", () => {
    expect(ipfsUrl("bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu")).toBe(
      "https://gateway.pinata.cloud/ipfs/bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu",
    );
  });
});
