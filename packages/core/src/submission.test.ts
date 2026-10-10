import { describe, expect, it } from "vitest";
import { submissionTypedData } from "./submission.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const GRAPH = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-staging";

describe("submissionTypedData", () => {
  it("returns the verisci domain, the Submission type and the message", () => {
    expect(
      submissionTypedData({ cid: CID, contextGraph: GRAPH, deadline: 1_800_000_000n }),
    ).toEqual({
      domain: { name: "verisci", version: "1", chainId: 84532 },
      types: {
        Submission: [
          { name: "cid", type: "string" },
          { name: "contextGraph", type: "string" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Submission",
      message: { cid: CID, contextGraph: GRAPH, deadline: 1_800_000_000n },
    });
  });

  it("writes the graph id's address in lowercase, so any casing signs one message", () => {
    const mixed = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging";

    expect(
      submissionTypedData({ cid: CID, contextGraph: mixed, deadline: 1n }).message.contextGraph,
    ).toBe(GRAPH);
  });

  it("keeps the graph name's case", () => {
    const named = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/Verisci-Staging";

    expect(
      submissionTypedData({ cid: CID, contextGraph: named, deadline: 1n }).message.contextGraph,
    ).toBe("0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/Verisci-Staging");
  });
});
