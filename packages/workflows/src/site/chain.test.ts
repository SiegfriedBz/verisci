import { ratingControllerAbi } from "@labstrail/contracts";
import { decodeFunctionData, encodeFunctionResult, type Hex, multicall3Abi } from "viem";
import { anvil, baseSepolia } from "viem/chains";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSiteChainClient, SITE_CHAIN_SETTINGS } from "./chain.ts";

const URL = "https://base-sepolia.example/rpc";
const CONTRACT = "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90";
const MULTICALL3 = baseSepolia.contracts.multicall3.address.toLowerCase();

interface RpcRequest {
  readonly id: number;
  readonly method: string;
  readonly params: readonly [{ readonly to: string; readonly data: Hex }, ...unknown[]];
}

/** A JSON-RPC answer as an RPC endpoint sends it. */
function answer(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Answers one Multicall3 `aggregate3` call: each `requestCountOf(ual)` gets the UAL's length. */
function multicallAnswer(request: RpcRequest): Response {
  const { args } = decodeFunctionData({ abi: multicall3Abi, data: request.params[0].data });
  const calls = args[0] as readonly { readonly callData: Hex }[];
  const result = calls.map(({ callData }) => {
    const decoded = decodeFunctionData({ abi: ratingControllerAbi, data: callData });
    const ual = String(decoded.args?.[0]);
    return {
      success: true,
      returnData: encodeFunctionResult({
        abi: ratingControllerAbi,
        functionName: "requestCountOf",
        result: BigInt(ual.length),
      }),
    };
  });
  return answer(
    request.id,
    encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result }),
  );
}

function countOf(client: ReturnType<typeof createSiteChainClient>, ual: string) {
  return client.readContract({
    address: CONTRACT,
    abi: ratingControllerAbi,
    functionName: "requestCountOf",
    args: [ual],
  });
}

describe("createSiteChainClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the reads a page makes at once as one Multicall3 call", async () => {
    const bodies: RpcRequest[] = [];
    const fetchFn = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RpcRequest;
      bodies.push(request);
      return multicallAnswer(request);
    });
    const client = createSiteChainClient(baseSepolia, URL, fetchFn as typeof fetch);

    const uals = Array.from(
      { length: 10 },
      (_, n) => `did:dkg:base:84532/0xabc/${"7".repeat(n + 1)}`,
    );
    const counts = await Promise.all(uals.map((ual) => countOf(client, ual)));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(bodies[0]?.method).toBe("eth_call");
    expect(bodies[0]?.params[0].to.toLowerCase()).toBe(MULTICALL3);
    expect(counts).toEqual(uals.map((ual) => BigInt(ual.length)));
  });

  it("asks once more, a second later, when the endpoint refuses a burst (429)", async () => {
    vi.useFakeTimers();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("Too Many Requests", { status: 429 }))
      .mockImplementationOnce(async (_input: unknown, init?: RequestInit) =>
        multicallAnswer(JSON.parse(String(init?.body)) as RpcRequest),
      );
    const client = createSiteChainClient(baseSepolia, URL, fetchFn as typeof fetch);

    const count = countOf(client, "did:dkg:base:84532/0xabc/7");
    await vi.advanceTimersByTimeAsync(SITE_CHAIN_SETTINGS.retryDelayMs - 1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(count).resolves.toBe(BigInt("did:dkg:base:84532/0xabc/7".length));
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the second refusal, so the page shows the read as not checked", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => new Response("Too Many Requests", { status: 429 }));
    const client = createSiteChainClient(baseSepolia, URL, fetchFn as typeof fetch);

    const count = countOf(client, "did:dkg:base:84532/0xabc/7");
    const settled = expect(count).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10 * SITE_CHAIN_SETTINGS.retryDelayMs);

    await settled;
    expect(fetchFn).toHaveBeenCalledTimes(1 + SITE_CHAIN_SETTINGS.retryCount);
  });

  it("calls the contract directly on a chain without Multicall3, such as Anvil", async () => {
    const bodies: RpcRequest[] = [];
    const fetchFn = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RpcRequest;
      bodies.push(request);
      return answer(
        request.id,
        encodeFunctionResult({
          abi: ratingControllerAbi,
          functionName: "requestCountOf",
          result: 2n,
        }),
      );
    });
    const client = createSiteChainClient(anvil, "http://127.0.0.1:8546", fetchFn as typeof fetch);

    await expect(countOf(client, "did:dkg:base:31337/0xabc/1")).resolves.toBe(2n);
    expect(bodies[0]?.params[0].to.toLowerCase()).toBe(CONTRACT);
    expect(bodies).toHaveLength(1);
  });
});
