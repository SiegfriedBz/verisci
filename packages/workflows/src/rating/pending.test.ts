import type { ReadRequestResult } from "@labstrail/contracts";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import { PENDING_CONCURRENCY, type PendingReads, readPending } from "./pending.ts";

const CONTRACT = "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90";
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

const request = (status: "pending" | "fulfilled", requestedAt: number): ReadRequestResult => ({
  ok: true,
  request: {
    status,
    cancelReason: "none",
    requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
    requestedAt,
    score: 0,
    targetUal: "x",
    rKaUal: "",
  },
});

/** Reads that answer from `answers` after a tick, counting how many are in flight at once. */
function reads(answers: (requestId: Hex) => ReadRequestResult) {
  let inFlight = 0;
  let most = 0;
  const io: PendingReads = {
    readPendingCount: async () => ({ ok: true, count: 0 }),
    readPendingIds: async () => ({ ok: true, ids: [] }),
    readRequest: async (_, requestId) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return answers(requestId);
    },
  };
  return { io, most: () => most };
}

describe("readPending", () => {
  it("keeps the requests still pending, with when they were made, and counts those that didn't answer", async () => {
    const { io } = reads((requestId) =>
      requestId === id(1)
        ? request("pending", 100)
        : requestId === id(2)
          ? request("fulfilled", 200)
          : { ok: false, reason: "unreachable" },
    );

    expect(await readPending(io, CONTRACT, [id(1), id(2), id(3)])).toEqual({
      pending: [{ requestId: id(1), requestedAt: 100 }],
      unreadable: 1,
    });
  });

  it(`reads at most ${PENDING_CONCURRENCY} requests at once, so a page stays within the RPC's rate limit`, async () => {
    const { io, most } = reads(() => request("pending", 100));
    const ids = Array.from({ length: 35 }, (_, n) => id(n + 1));

    const { pending } = await readPending(io, CONTRACT, ids);

    expect(pending).toHaveLength(35);
    expect(most()).toBe(PENDING_CONCURRENCY);
  });
});
