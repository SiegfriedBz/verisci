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
});
