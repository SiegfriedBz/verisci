import { ratingControllerAbi } from "@labstrail/contracts";
import { encodeAbiParameters, encodeEventTopics, type Hex, keccak256, toHex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { type RequestDeps, requestRating } from "./request-flow.ts";

const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const OTHER = "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90";
const ADDRESS = "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111";
const TX = `0x${"cd".repeat(32)}` as Hex;
const REQUEST_ID = `0x${"ab".repeat(32)}` as Hex;

const requestLog = (address: string) => ({
  address,
  topics: encodeEventTopics({
    abi: ratingControllerAbi,
    eventName: "Phase1Requested",
    args: { requestId: REQUEST_ID, requester: ADDRESS, targetUalHash: keccak256(toHex(UAL)) },
  }) as Hex[],
  data: encodeAbiParameters([{ type: "string" }, { type: "uint64" }], [UAL, 1_791_900_000n]),
});

function deps(over: Partial<RequestDeps> = {}): RequestDeps & {
  [K in "connect" | "switchChain" | "sendRequest" | "announce"]: ReturnType<typeof vi.fn>;
} {
  return {
    chainId: 31_337,
    contract: CONTRACT,
    local: true,
    account: () => ({ address: ADDRESS, chainId: 31_337 }),
    connect: vi.fn(),
    switchChain: vi.fn(async () => undefined),
    sendRequest: vi.fn(async () => TX),
    waitForReceipt: async () => ({ reverted: false, logs: [requestLog(CONTRACT)] }),
    announce: vi.fn(async () => ({ ok: true as const, requestId: REQUEST_ID })),
    ...over,
  } as never;
}

/** An error like viem's: a chain of causes, the revert's name on `data.errorName`. */
function reverted(errorName: string) {
  return Object.assign(new Error("execution reverted"), {
    name: "ContractFunctionExecutionError",
    cause: { name: "ContractFunctionRevertedError", data: { errorName } },
  });
}

describe("requestRating", () => {
  it("sends requestPhase1 with the paper's UAL, then announces it locally", async () => {
    const flow = deps();

    expect(await requestRating(UAL, flow)).toEqual({ ok: true, requestId: REQUEST_ID });
    expect(flow.sendRequest).toHaveBeenCalledWith(UAL);
    expect(flow.announce).toHaveBeenCalledWith(TX);
    expect(flow.switchChain).not.toHaveBeenCalled();
  });

  it("announces nothing when deployed: the webhook does", async () => {
    const flow = deps({
      local: false,
      chainId: 84_532,
      account: () => ({ address: ADDRESS, chainId: 84_532 }),
    });

    expect(await requestRating(UAL, flow)).toEqual({ ok: true, requestId: REQUEST_ID });
    expect(flow.announce).not.toHaveBeenCalled();
  });

  it("opens the wallet window when no wallet is connected, and sends nothing", async () => {
    const flow = deps({ account: () => undefined });

    expect(await requestRating(UAL, flow)).toEqual({ ok: false, problem: "connect" });
    expect(flow.connect).toHaveBeenCalledOnce();
    expect(flow.sendRequest).not.toHaveBeenCalled();
  });

  it("switches the wallet to the rating chain first", async () => {
    const flow = deps({ account: () => ({ address: ADDRESS, chainId: 84_532 }) });

    await requestRating(UAL, flow);

    expect(flow.switchChain).toHaveBeenCalledWith(31_337);
    expect(flow.switchChain.mock.invocationCallOrder[0]).toBeLessThan(
      flow.sendRequest.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it.each([
    ["TooManyPending", "too-many-pending"],
    ["EnforcedPause", "paused"],
  ])("names a %s revert", async (errorName, problem) => {
    const flow = deps({ sendRequest: vi.fn(async () => Promise.reject(reverted(errorName))) });

    expect(await requestRating(UAL, flow)).toEqual({ ok: false, problem });
  });

  it("returns quietly when the visitor refuses to sign", async () => {
    const refused = Object.assign(new Error("User rejected the request."), {
      name: "TransactionExecutionError",
      cause: { name: "UserRejectedRequestError" },
    });
    const flow = deps({ sendRequest: vi.fn(async () => Promise.reject(refused)) });

    expect(await requestRating(UAL, flow)).toEqual({ ok: false, problem: "declined" });
  });

  it("is unavailable for any other failure", async () => {
    const flow = deps({ sendRequest: vi.fn(async () => Promise.reject(new Error("boom"))) });

    expect(await requestRating(UAL, flow)).toEqual({ ok: false, problem: "unavailable" });
  });

  it("says the request was sent when its receipt never comes", async () => {
    const flow = deps({ waitForReceipt: async () => undefined });

    expect(await requestRating(UAL, flow)).toEqual({ ok: true, unconfirmed: TX });
    expect(flow.announce).not.toHaveBeenCalled();
  });

  it("says the contract refused a request whose transaction reverted", async () => {
    const flow = deps({ waitForReceipt: async () => ({ reverted: true, logs: [] }) });

    expect(await requestRating(UAL, flow)).toEqual({ ok: false, problem: "refused" });
    expect(flow.announce).not.toHaveBeenCalled();
  });

  it("reads the request id only from this contract's log", async () => {
    const flow = deps({
      waitForReceipt: async () => ({ reverted: false, logs: [requestLog(OTHER)] }),
    });

    expect(await requestRating(UAL, flow)).toEqual({ ok: true, unconfirmed: TX });
  });

  it("still gives the request id when the local announce fails", async () => {
    const flow = deps({
      announce: vi.fn(async () => ({ ok: false as const, reason: "unavailable" as const })),
    });

    expect(await requestRating(UAL, flow)).toEqual({
      ok: true,
      requestId: REQUEST_ID,
      notAnnounced: true,
    });
  });
});
