import { submissionTypedData } from "@verisci/core";
import { createPublicClient, custom } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { describe, expect, it } from "vitest";
import { verifySubmission } from "./verify-submission.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const GRAPH = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-staging";
const NOW_MS = 1_800_000_000_000;
const DEADLINE = 1_800_000_600n;
const submitter = privateKeyToAccount(generatePrivateKey());
const SMART_WALLET = "0x1111111111111111111111111111111111111111";

/** A public client whose `eth_call` answers `callResult`, or fails when it is undefined. */
function client(callResult?: boolean) {
  const calls: string[] = [];
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: custom(
      {
        async request({ method }: { method: string }) {
          calls.push(method);
          if (callResult === undefined) throw new Error("rpc down");
          if (method === "eth_call")
            return `0x${(callResult ? 1 : 0).toString(16).padStart(64, "0")}`;
          if (method === "eth_blockNumber") return "0x1";
          throw new Error("rpc down");
        },
      },
      { retryCount: 0 },
    ),
  });
  return { publicClient, calls };
}

async function signed(overrides: { cid?: string; contextGraph?: string; deadline?: bigint } = {}) {
  const message = { cid: CID, contextGraph: GRAPH, deadline: DEADLINE, ...overrides };
  const signature = await submitter.signTypedData(submissionTypedData(message));
  return {
    cid: message.cid,
    contextGraph: message.contextGraph,
    deadline: message.deadline.toString(),
    submitter: submitter.address,
    signature,
  };
}

function verify(data: unknown, publicClient = client().publicClient) {
  return verifySubmission(data, { contextGraph: GRAPH, client: publicClient, now: () => NOW_MS });
}

describe("verifySubmission", () => {
  it("accepts a signature by the submitter, without calling the chain", async () => {
    const { publicClient, calls } = client();

    expect(await verify(await signed(), publicClient)).toEqual({
      ok: true,
      submission: {
        cid: CID,
        contextGraph: GRAPH,
        deadline: DEADLINE.toString(),
        submitter: submitter.address.toLowerCase(),
        signature: expect.stringMatching(/^0x[0-9a-f]+$/),
      },
    });
    expect(calls).toEqual([]);
  });

  it("refuses a signature by another address", async () => {
    const data = {
      ...(await signed()),
      submitter: privateKeyToAccount(generatePrivateKey()).address,
    };

    expect(await verify(data, client(false).publicClient)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("refuses a deadline already passed", async () => {
    const data = await signed({ deadline: BigInt(NOW_MS / 1000) });

    expect(await verify(data)).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses a signature for another context graph", async () => {
    const data = await signed({
      contextGraph: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-prod",
    });

    expect(await verify(data)).toEqual({ ok: false, reason: "wrong-graph" });
  });

  it.each([
    ["a CIDv0", "QmQ8qD6HdvrjfvaCgkRuuuJBXspNkzTgk4syXpaZK8oUjX"],
    ["a base58btc CIDv1", "zb2rhe5P4gXftAwvA4eXQ5HJwsER2owDyS9sKaQRRVQPn93bA"],
    ["an uppercase CID", CID.toUpperCase()],
    ["not a CID", "not-a-cid"],
  ])("refuses %s as bad-cid", async (_, cid) => {
    expect(await verify(await signed({ cid }))).toEqual({ ok: false, reason: "bad-cid" });
  });

  it("accepts a smart-contract wallet that validates the signature", async () => {
    const data = { ...(await signed()), submitter: SMART_WALLET };

    expect(await verify(data, client(true).publicClient)).toMatchObject({
      ok: true,
      submission: { submitter: SMART_WALLET },
    });
  });

  it("reports unreachable when the chain cannot be asked about a non-EOA signature", async () => {
    const data = { ...(await signed()), submitter: SMART_WALLET };

    expect(await verify(data, client().publicClient)).toEqual({ ok: false, reason: "unreachable" });
  });

  it.each([
    ["no data", undefined],
    ["a missing field", { cid: CID, contextGraph: GRAPH, deadline: "1", submitter: SMART_WALLET }],
    [
      "a deadline that is not a number",
      {
        cid: CID,
        contextGraph: GRAPH,
        deadline: "soon",
        submitter: SMART_WALLET,
        signature: "0x12",
      },
    ],
    [
      "a submitter that is not an address",
      { cid: CID, contextGraph: GRAPH, deadline: "1", submitter: "bob", signature: "0x12" },
    ],
    [
      "a signature that is not hex",
      { cid: CID, contextGraph: GRAPH, deadline: "1", submitter: SMART_WALLET, signature: "xyz" },
    ],
  ])("refuses %s as malformed", async (_, data) => {
    expect(await verify(data)).toEqual({ ok: false, reason: "malformed" });
  });
});
