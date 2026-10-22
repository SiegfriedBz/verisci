import type { RatingRequestState, ReadRequestResult } from "@labstrail/contracts";
import { ratingControllerAbi } from "@labstrail/contracts";
import { rKaName, rKaQuads, SCORER_PROMPT_VERSION } from "@labstrail/core";
import type { AssetResult, QueryResult } from "@labstrail/dkg";
import { encodeAbiParameters, encodeEventTopics, type Hex, keccak256, toHex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { createRatingService, type RatingIo, summariseRatings } from "./ratings.ts";

const GRAPH = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging";
const AGENT = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3";
const TARGET = `did:dkg:base:84532/${AGENT}/7`;
const OTHER = `did:dkg:base:84532/${AGENT}/8`;
const R_KA = `did:dkg:base:84532/${AGENT}/14`;
const CURRENT = "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90";
const PAST = "0xe91617faa0f2c39e62d3a887c1f4933595efc9dc";
const ANVIL = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const TX = `0x${"cd".repeat(32)}` as Hex;
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

function request(over: Partial<RatingRequestState> = {}): RatingRequestState {
  return {
    status: "pending",
    cancelReason: "none",
    requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
    requestedAt: 1_791_900_000,
    score: 0,
    targetUal: TARGET,
    rKaUal: "",
    ...over,
  };
}

/** The node's rows for a minted R-KA scoring `score`. */
function rKaRows(requestId: Hex, score: number) {
  return rKaQuads({
    requestId,
    targetUal: TARGET,
    contract: `eip155:84532:${CURRENT}`,
    model: "gemini-3.8-flash",
    promptVersion: SCORER_PROMPT_VERSION,
    textShortened: true,
    output: {
      score,
      rationale: "Clear aims; no limitations section.",
      studyType: "narrative-review",
      checks: [
        { id: "importance", answer: "shown", quote: "Nanomedicine applies nanotechnology." },
        {
          id: "limitations",
          answer: "missing",
          claimed: { answer: "shown", quote: "We acknowledge several limits." },
        },
      ],
    },
  }).map((triple) => ({ s: triple.subject, p: triple.predicate, o: triple.object }));
}

/** A fake chain and node: `requests` per contract, keyed by id, in index order per target. */
function io(
  options: {
    requests?: Record<string, Record<string, RatingRequestState>>;
    local?: boolean;
    asset?: AssetResult;
    query?: QueryResult;
    receipt?: Awaited<ReturnType<RatingIo["readReceiptLogs"]>>;
    send?: RatingIo["send"];
    readRequest?: RatingIo["readRequest"];
  } = {},
): RatingIo & { warn: ReturnType<typeof vi.fn>; sent: unknown[] } {
  const requests = options.requests ?? {};
  const sent: unknown[] = [];
  const warn = vi.fn();
  return {
    contracts: options.local ? [ANVIL] : [CURRENT, PAST],
    local: options.local ?? false,
    contextGraph: GRAPH,
    readRequestIds: async (contract, ual) => ({
      ok: true,
      ids: Object.entries(requests[contract] ?? {})
        .filter(([, r]) => r.targetUal === ual)
        .map(([key]) => key as Hex),
    }),
    readRequest:
      options.readRequest ??
      (async (contract, requestId): Promise<ReadRequestResult> => ({
        ok: true,
        request: requests[contract]?.[requestId] ?? request({ status: "none", targetUal: "" }),
      })),
    readAsset: async () => options.asset ?? { ok: true, state: "missing" },
    query: async () => options.query ?? { ok: true, bindings: [] },
    readReceiptLogs: async () => options.receipt ?? [],
    send:
      options.send ??
      (async (event) => {
        sent.push(event);
      }),
    logger: { warn },
    warn,
    sent,
  };
}

describe("listRatings", () => {
  it("lists a paper's ratings on every contract, oldest first", async () => {
    const service = createRatingService(
      io({
        requests: {
          [CURRENT]: {
            [id(3)]: request({ requestedAt: 300, status: "fulfilled", score: 67, rKaUal: R_KA }),
          },
          [PAST]: {
            [id(1)]: request({ requestedAt: 100, status: "cancelled", cancelReason: "expired" }),
            [id(2)]: request({ requestedAt: 200 }),
            [id(9)]: request({ requestedAt: 50, targetUal: OTHER }),
          },
        },
      }),
    );

    expect(await service.listRatings(TARGET)).toEqual({
      ok: true,
      ratings: [
        {
          requestId: id(1),
          contract: PAST,
          status: "cancelled",
          cancelReason: "expired",
          requestedAt: 100,
        },
        { requestId: id(2), contract: PAST, status: "pending", requestedAt: 200 },
        {
          requestId: id(3),
          contract: CURRENT,
          status: "fulfilled",
          score: 67,
          rKaUal: R_KA,
          requestedAt: 300,
        },
      ],
    });
  });

  it("reads only the Anvil contract locally", async () => {
    const service = createRatingService(
      io({
        local: true,
        requests: {
          [ANVIL]: { [id(1)]: request() },
          [CURRENT]: { [id(2)]: request() },
        },
      }),
    );

    const list = await service.listRatings(TARGET);

    expect(list.ok && list.ratings.map((r) => r.contract)).toEqual([ANVIL]);
  });

  it("returns an empty list for a paper never rated", async () => {
    expect(await createRatingService(io()).listRatings(TARGET)).toEqual({ ok: true, ratings: [] });
  });

  it("is unavailable when the chain does not answer", async () => {
    const fake = io({ requests: { [CURRENT]: { [id(1)]: request() } } });
    const service = createRatingService({
      ...fake,
      readRequestIds: async () => ({ ok: false, reason: "unreachable" }),
    });

    expect(await service.listRatings(TARGET)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("summariseRatings", () => {
  const rating = (status: "pending" | "fulfilled" | "cancelled", extra = {}) => ({
    requestId: id(1),
    contract: CURRENT,
    requestedAt: 100,
    status,
    ...extra,
  });

  it("keeps a score over a later cancel, and a pending request over an invalid-target cancel", () => {
    expect(
      summariseRatings([
        rating("fulfilled", { score: 50, rKaUal: R_KA }),
        rating("cancelled", { cancelReason: "invalid-target" }),
      ]),
    ).toEqual({ kind: "scored", score: 50, requestId: id(1) });
    expect(
      summariseRatings([
        rating("cancelled", { cancelReason: "invalid-target" }),
        rating("pending"),
      ]),
    ).toEqual({ kind: "pending" });
  });

  it("says a paper only ever cancelled as expired is unrated", () => {
    expect(summariseRatings([rating("cancelled", { cancelReason: "expired" })])).toEqual({
      kind: "unrated",
    });
  });
});

describe("paperRatingSummaries", () => {
  it("gives each paper its latest fulfilled score, else pending, else cannot-rate, else unrated", async () => {
    const third = `did:dkg:base:84532/${AGENT}/9`;
    const service = createRatingService(
      io({
        requests: {
          [CURRENT]: {
            [id(1)]: request({ requestedAt: 100, status: "fulfilled", score: 40, rKaUal: R_KA }),
            [id(2)]: request({ requestedAt: 300, status: "fulfilled", score: 67, rKaUal: R_KA }),
            [id(3)]: request({ requestedAt: 400, status: "cancelled", cancelReason: "expired" }),
            [id(4)]: request({ requestedAt: 100, targetUal: OTHER }),
            [id(5)]: request({
              requestedAt: 100,
              targetUal: third,
              status: "cancelled",
              cancelReason: "invalid-target",
            }),
          },
        },
      }),
    );

    expect(
      await service.paperRatingSummaries([TARGET, OTHER, third, `did:dkg:base:84532/${AGENT}/99`]),
    ).toEqual([
      { kind: "scored", score: 67, requestId: id(2) },
      { kind: "pending" },
      { kind: "cannot-rate" },
      { kind: "unrated" },
    ]);
  });

  it("still gives the score when the chain's reads take a retry's extra second", async () => {
    vi.useFakeTimers();
    try {
      const base = io({
        requests: {
          [CURRENT]: { [id(2)]: request({ status: "fulfilled", score: 67, rKaUal: R_KA }) },
        },
      });
      const late =
        <A extends unknown[], R>(read: (...args: A) => Promise<R>, ms: number) =>
        (...args: A) =>
          new Promise<R>((resolve) => setTimeout(() => resolve(read(...args)), ms));
      // A refused first try, a 1 s wait and an answer: about 1.2 s for the ids, 0.2 s per request.
      const service = createRatingService({
        ...base,
        readRequestIds: late(base.readRequestIds, 1_200),
        readRequest: late(base.readRequest, 200),
      });

      const summaries = service.paperRatingSummaries([TARGET]);
      await vi.advanceTimersByTimeAsync(2_000);

      expect(await summaries).toEqual([{ kind: "scored", score: 67, requestId: id(2) }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits up to 6 s for the chain, then gives unknown", async () => {
    vi.useFakeTimers();
    try {
      const service = createRatingService({
        ...io(),
        readRequestIds: () => new Promise(() => {}),
      });

      let settled = false;
      const summaries = service.paperRatingSummaries([TARGET]);
      void summaries.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(5_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(await summaries).toEqual([{ kind: "unknown" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives unknown when the chain does not answer", async () => {
    const service = createRatingService({
      ...io(),
      readRequestIds: async () => ({ ok: false, reason: "unreachable" }),
    });

    expect(await service.paperRatingSummaries([TARGET])).toEqual([{ kind: "unknown" }]);
  });
});

describe("readRating", () => {
  it("is not-found when no contract of the environment holds the id", async () => {
    expect(await createRatingService(io()).readRating(id(1))).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("is unavailable when the chain does not answer", async () => {
    const service = createRatingService(
      io({ readRequest: async () => ({ ok: false, reason: "unreachable" }) }),
    );

    expect(await service.readRating(id(1))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("asks every contract at once, so a slow one costs one wait, not one per contract", async () => {
    const asked: string[] = [];
    let answer: (() => void) | undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const service = createRatingService(
      io({
        readRequest: async (contract) => {
          asked.push(contract);
          await answered;
          return { ok: true, request: request({ status: "none", targetUal: "" }) };
        },
      }),
    );

    const view = service.readRating(id(1));
    await Promise.resolve();
    expect(asked).toEqual([CURRENT, PAST]);
    answer?.();
    expect(await view).toEqual({ ok: false, reason: "not-found" });
  });

  it.each<[AssetResult, string]>([
    [{ ok: true, state: "missing" }, "scoring"],
    [{ ok: true, state: "draft" }, "saving"],
    [{ ok: true, state: "stored", reservedUal: R_KA }, "minting"],
    [{ ok: true, state: "minted", ual: R_KA }, "recording"],
    [{ ok: false, reason: "unreachable" }, "unknown"],
  ])("follows a pending rating by its R-KA on the node: %o is %s", async (asset, stage) => {
    const fake = io({ asset, requests: { [PAST]: { [id(2)]: request({ requestedAt: 200 }) } } });
    const readAsset = vi.spyOn(fake, "readAsset");

    const view = await createRatingService(fake).readRating(id(2));

    expect(view).toEqual({
      ok: true,
      rating: {
        requestId: id(2),
        contract: PAST,
        status: "pending",
        requestedAt: 200,
        targetUal: TARGET,
      },
      stage,
    });
    const name = rKaName(id(2));
    expect(readAsset).toHaveBeenCalledWith(name.ok ? name.name : "");
  });

  it("gives a fulfilled rating's contract score and its R-KA's record", async () => {
    const service = createRatingService(
      io({
        requests: {
          [CURRENT]: { [id(3)]: request({ status: "fulfilled", score: 50, rKaUal: R_KA }) },
        },
        query: { ok: true, bindings: rKaRows(id(3), 50) },
      }),
    );

    const view = await service.readRating(id(3));

    expect(view.ok && view.rating.score).toBe(50);
    expect(view.ok && view.gap).toBe(false);
    expect(view.ok && view.record).toMatchObject({
      score: 50,
      studyType: "narrative-review",
      rationale: "Clear aims; no limitations section.",
      model: "gemini-3.8-flash",
      promptVersion: SCORER_PROMPT_VERSION,
      textShortened: true,
      checks: [
        { id: "importance", answer: "shown", quote: "Nanomedicine applies nanotechnology." },
        {
          id: "limitations",
          answer: "missing",
          claimed: { answer: "shown", quote: "We acknowledge several limits." },
        },
      ],
    });
  });

  it("keeps the contract's score and flags a gap when the R-KA disagrees", async () => {
    const service = createRatingService(
      io({
        requests: {
          [CURRENT]: { [id(3)]: request({ status: "fulfilled", score: 50, rKaUal: R_KA }) },
        },
        query: { ok: true, bindings: rKaRows(id(3), 80) },
      }),
    );

    const view = await service.readRating(id(3));

    expect(view.ok && view.rating.score).toBe(50);
    expect(view.ok && view.gap).toBe(true);
  });

  it.each<[QueryResult, string]>([
    [{ ok: false, reason: "unreachable" }, "unavailable"],
    [{ ok: false, reason: "unexpected", status: 400 }, "unreadable"],
    [{ ok: true, bindings: [] }, "unreadable"],
  ])(
    "gives the contract's score with recordProblem when the R-KA reads as %o",
    async (query, problem) => {
      const service = createRatingService(
        io({
          requests: {
            [CURRENT]: { [id(3)]: request({ status: "fulfilled", score: 50, rKaUal: R_KA }) },
          },
          query,
        }),
      );

      const view = await service.readRating(id(3));

      expect(view.ok && view.rating.score).toBe(50);
      expect(view.ok && view.recordProblem).toBe(problem);
      expect(view.ok && view.record).toBeUndefined();
    },
  );

  it.each(["invalid-target", "expired"] as const)(
    "gives a cancelled rating's reason, %s",
    async (reason) => {
      const service = createRatingService(
        io({
          requests: {
            [CURRENT]: { [id(4)]: request({ status: "cancelled", cancelReason: reason }) },
          },
        }),
      );

      const view = await service.readRating(id(4));

      expect(view.ok && view.rating).toMatchObject({ status: "cancelled", cancelReason: reason });
      expect(view.ok && view.stage).toBeUndefined();
    },
  );
});

describe("announceLocalRating", () => {
  const requestId = id(7);
  const log = {
    address: ANVIL,
    topics: encodeEventTopics({
      abi: ratingControllerAbi,
      eventName: "Phase1Requested",
      args: {
        requestId,
        requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
        targetUalHash: keccak256(toHex(TARGET)),
      },
    }) as Hex[],
    data: encodeAbiParameters([{ type: "string" }, { type: "uint64" }], [TARGET, 1_791_900_000n]),
  };

  it("sends the request's event from the transaction's receipt", async () => {
    const fake = io({ local: true, receipt: [log] });

    expect(await createRatingService(fake).announceLocalRating(TX)).toEqual({
      ok: true,
      requestId,
    });
    expect(fake.sent).toEqual([
      {
        name: "labstrail/rating.requested",
        id: `rating:${requestId}`,
        data: { contract: ANVIL, requestId },
      },
    ]);
  });

  it("refuses a transaction with no request log of the Anvil contract, and sends nothing", async () => {
    const fake = io({ local: true, receipt: [{ ...log, address: CURRENT }] });

    expect(await createRatingService(fake).announceLocalRating(TX)).toEqual({
      ok: false,
      reason: "no-request",
    });
    expect(fake.sent).toEqual([]);
  });

  it("refuses outside local, reading and sending nothing", async () => {
    const fake = io({ receipt: [log] });
    const readReceiptLogs = vi.spyOn(fake, "readReceiptLogs");

    expect(await createRatingService(fake).announceLocalRating(TX)).toEqual({
      ok: false,
      reason: "not-local",
    });
    expect(readReceiptLogs).not.toHaveBeenCalled();
    expect(fake.sent).toEqual([]);
  });

  it("is unavailable and logs one warning when Anvil's receipt cannot be read", async () => {
    const fake = io({ local: true, receipt: "unreachable" });

    expect(await createRatingService(fake).announceLocalRating(TX)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(fake.warn).toHaveBeenCalledOnce();
    expect(fake.warn).toHaveBeenCalledWith(
      `rating-announce-unavailable: anvil: no receipt for ${TX}`,
    );
    expect(fake.sent).toEqual([]);
  });

  it("is unavailable and logs one warning when Inngest does not answer", async () => {
    const fake = io({
      local: true,
      receipt: [log],
      send: async () => {
        throw new Error("fetch failed (connect ECONNREFUSED 127.0.0.1:8288)");
      },
    });

    expect(await createRatingService(fake).announceLocalRating(TX)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(fake.warn).toHaveBeenCalledOnce();
    expect(fake.warn).toHaveBeenCalledWith(
      "rating-announce-unavailable: inngest: fetch failed (connect ECONNREFUSED 127.0.0.1:8288)",
    );
  });
});
