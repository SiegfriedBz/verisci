import { ratingControllerAbi } from "@labstrail/contracts";
import { encodeAbiParameters, encodeEventTopics, type Hex, keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { RATING_REQUESTED, ratingRequestedEvent } from "./events.ts";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const REQUEST_ID = `0x${"ab".repeat(32)}` as const;
const TARGET = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";

const requestedLog = {
  address: CONTRACT,
  topics: encodeEventTopics({
    abi: ratingControllerAbi,
    eventName: "Phase1Requested",
    args: {
      requestId: REQUEST_ID,
      requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
      targetUalHash: keccak256(toHex(TARGET)),
    },
  }) as Hex[],
  data: encodeAbiParameters([{ type: "string" }, { type: "uint64" }], [TARGET, 1_791_639_437n]),
};

describe("ratingRequestedEvent", () => {
  it("turns a Phase1Requested log into the rating event, keyed on the request id", () => {
    expect(ratingRequestedEvent(requestedLog)).toEqual({
      name: RATING_REQUESTED,
      id: `rating:${REQUEST_ID}`,
      data: { contract: CONTRACT.toLowerCase(), requestId: REQUEST_ID },
    });
    expect(RATING_REQUESTED).toBe("labstrail/rating.requested");
  });

  it("gives nothing for another event of the contract", () => {
    const fulfilled = {
      address: CONTRACT,
      topics: encodeEventTopics({
        abi: ratingControllerAbi,
        eventName: "Phase1Fulfilled",
        args: { requestId: REQUEST_ID },
      }) as Hex[],
      data: encodeAbiParameters([{ type: "uint8" }, { type: "string" }], [72, TARGET]),
    };

    expect(ratingRequestedEvent(fulfilled)).toBeUndefined();
  });

  it("gives nothing for a log no event of the contract matches", () => {
    expect(
      ratingRequestedEvent({ address: CONTRACT, topics: [`0x${"00".repeat(32)}`], data: "0x" }),
    ).toBeUndefined();
  });
});
