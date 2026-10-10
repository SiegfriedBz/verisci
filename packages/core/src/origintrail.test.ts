import { describe, expect, it } from "vitest";
import { knowledgeAssetToken, ORIGINTRAIL_CONTRACTS } from "./origintrail.ts";
import { parseUal, type Ual } from "./ual.ts";

const NODE = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3";
const { knowledgeAssets } = ORIGINTRAIL_CONTRACTS[84532] ?? { knowledgeAssets: "0x" };

function ual(text: string): Ual {
  const parsed = parseUal(text);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.ual;
}

describe("knowledgeAssetToken", () => {
  it("packs the author into the token id of a V10 UAL, as the mint of asset 8 shows", () => {
    expect(knowledgeAssetToken(ual(`did:dkg:base:84532/${NODE}/8`))).toEqual({
      contract: knowledgeAssets,
      tokenId: 97250665584536569906395019546324268771044027214492192272407200191098042449928n,
    });
  });

  it("takes the id as the token id when the UAL names the KnowledgeAssets contract", () => {
    expect(knowledgeAssetToken(ual(`did:dkg:base:84532/${knowledgeAssets}/42`))).toEqual({
      contract: knowledgeAssets,
      tokenId: 42n,
    });
  });

  it("finds no token on a chain whose contracts are not recorded", () => {
    expect(knowledgeAssetToken(ual(`did:dkg:base:8453/${NODE}/8`))).toBeUndefined();
  });

  it("finds no token when a V10 number would overflow its 96 bits", () => {
    expect(knowledgeAssetToken(ual(`did:dkg:base:84532/${NODE}/${2n ** 96n}`))).toBeUndefined();
  });
});
