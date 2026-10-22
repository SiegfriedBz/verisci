import type { ReadRequestResult } from "@labstrail/contracts";
import { Inngest } from "inngest";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { createHealthCheck, HEALTH_SETTINGS, type HealthDeps, runHealthCheck } from "./health.ts";

const HOUR = 3_600_000;
const NOW = 1_791_900_000_000;
const ETH = 10n ** 18n;
const ORACLE = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const PUBLISHER = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3";
const CONTRACT = "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90";
const NODE = "https://verisci-dkg.duckdns.org";
const GRAPH = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging";
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

function deps(
  state: {
    eth?: Record<string, bigint | undefined>;
    trac?: Record<string, bigint | undefined>;
    pending?: readonly (readonly [Hex, number])[];
  },
  overrides: Partial<HealthDeps> = {},
): HealthDeps {
  const pending = state.pending ?? [];
  const eth: Record<string, bigint | undefined> = { [ORACLE]: ETH, [PUBLISHER]: ETH, ...state.eth };
  const trac: Record<string, bigint | undefined> = { [PUBLISHER]: 900n * ETH, ...state.trac };
  return {
    oracle: ORACLE,
    publishers: [PUBLISHER],
    contracts: [CONTRACT],
    node: NODE,
    graph: GRAPH,
    readNodeStatus: async () => ({
      ok: true,
      graph: { authorityState: "accepted", policySource: "finalized-chain" },
    }),
    readEth: async (address) => eth[address],
    readTrac: async (address) => trac[address],
    readPendingCount: async () => ({ ok: true, count: pending.length }),
    readPendingIds: async (_, offset, limit) => ({
      ok: true,
      ids: pending.slice(offset, offset + limit).map(([requestId]) => requestId),
    }),
    readRequest: async (_, requestId): Promise<ReadRequestResult> => ({
      ok: true,
      request: {
        status: "pending",
        cancelReason: "none",
        requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
        requestedAt: Math.floor(
          (NOW - (pending.find(([found]) => found === requestId)?.[1] ?? 0)) / 1000,
        ),
        score: 0,
        targetUal: "x",
        rKaUal: "",
      },
    }),
    logger: { warn: vi.fn() },
    ...overrides,
  };
}

/** Runs one check on `io` at `nowMs` with steps that round-trip each output through JSON. */
async function check(io: HealthDeps, nowMs = NOW) {
  const log: string[] = [];
  const alert = vi.fn(async (_text: string) => {});
  const step = {
    async run<T>(stepId: string, fn: () => Promise<T>): Promise<T> {
      log.push(stepId);
      return JSON.parse(JSON.stringify(await fn()));
    },
  };
  const { problems } = await runHealthCheck(
    step,
    () => io,
    alert,
    () => nowMs,
  );
  return { problems, log, alert };
}

describe("runHealthCheck", () => {
  it("reads the node, the balances, then each contract in a step of its own, and sends nothing when all is well", async () => {
    const { problems, log, alert } = await check(deps({ pending: [[id(1), HOUR]] }));

    expect(problems).toEqual([]);
    expect(log).toEqual(["check-node", "check-balances", `check-pending-${CONTRACT}`]);
    expect(alert).not.toHaveBeenCalled();
  });

  it("names the oracle and each publisher wallet under their ETH threshold, and TRAC under its own", async () => {
    const low = HEALTH_SETTINGS.minEthWei - 1n;

    const { problems } = await check(
      deps({ eth: { [ORACLE]: low, [PUBLISHER]: low }, trac: { [PUBLISHER]: 42n * ETH } }),
    );

    expect(problems).toEqual([
      `oracle ${ORACLE} holds 0.004999999999999999 ETH, under 0.005`,
      `publisher ${PUBLISHER} holds 0.004999999999999999 ETH, under 0.005`,
      `publisher ${PUBLISHER} holds 42 TRAC, under 100`,
    ]);
  });

  it("names how many requests are pending past 6 hours, and the oldest", async () => {
    const { problems } = await check(
      deps({
        pending: [
          [id(1), 7 * HOUR],
          [id(2), 9 * HOUR],
          [id(3), HOUR],
        ],
      }),
    );

    expect(problems).toEqual([
      `2 rating requests pending over 6 h; the oldest, ${id(2)} on ${CONTRACT}, for 9 h`,
    ]);
  });

  it("logs a balance it couldn't read, and leaves it for the next hour", async () => {
    const io = deps({ eth: { [ORACLE]: undefined }, trac: { [PUBLISHER]: undefined } });

    const { problems } = await check(io);

    expect(problems).toEqual([]);
    expect(io.logger.warn).toHaveBeenCalledWith(`health-unreadable: oracle ${ORACLE}: ETH`);
    expect(io.logger.warn).toHaveBeenCalledWith(`health-unreadable: publisher ${PUBLISHER}: TRAC`);
  });

  it("reads at most 2 pages a contract an hour, going on from the last hour's, and says how many it read", async () => {
    const { pageSize, pagesPerHour } = HEALTH_SETTINGS;
    const old = Array.from({ length: pageSize * 5 }, (_, n) => [id(n + 1), 7 * HOUR] as const);
    const offsets: number[] = [];
    const io = deps({ pending: old });
    const counted: HealthDeps = {
      ...io,
      readPendingIds: (contract, offset, limit) => {
        offsets.push(offset);
        return io.readPendingIds(contract, offset, limit);
      },
    };

    const { problems } = await check(counted);
    await check(counted, NOW + HOUR);
    await check(counted, NOW + 2 * HOUR);

    expect(offsets).toHaveLength(3 * pagesPerHour);
    expect(new Set(offsets)).toEqual(new Set([0, 1, 2, 3, 4].map((page) => page * pageSize)));
    expect(problems).toEqual([
      `200 rating requests pending over 6 h; the oldest, ${id((offsets[0] ?? 0) + 1)} on ${CONTRACT}, for 7 h (200 of the 500 pending read this hour)`,
    ]);
  });

  it("logs a contract it couldn't reach, and how many requests didn't answer", async () => {
    const reachable = deps({
      pending: [
        [id(1), 7 * HOUR],
        [id(2), 7 * HOUR],
      ],
    });
    const unreachable = deps(
      {},
      { readPendingCount: async () => ({ ok: false, reason: "unreachable" }) },
    );
    const partial = deps(
      {},
      {
        readRequest: async (contract, requestId) =>
          requestId === id(1)
            ? { ok: false, reason: "unreachable" }
            : reachable.readRequest(contract, requestId),
        readPendingCount: reachable.readPendingCount,
        readPendingIds: reachable.readPendingIds,
      },
    );

    await check(unreachable);
    const { problems } = await check(partial);

    expect(unreachable.logger.warn).toHaveBeenCalledWith(`health-unreachable: ${CONTRACT}`);
    expect(partial.logger.warn).toHaveBeenCalledWith(
      `health-unreadable: ${CONTRACT}: 1 of 2 requests`,
    );
    expect(problems).toEqual([
      `1 rating requests pending over 6 h; the oldest, ${id(2)} on ${CONTRACT}, for 7 h`,
    ]);
  });

  it("reads one contract at a time", async () => {
    const other = "0x1111111111111111111111111111111111111111";
    const io = deps({ pending: [[id(1), HOUR]] });
    let inFlight = 0;
    let most = 0;
    const counted: HealthDeps = {
      ...io,
      contracts: [CONTRACT, other],
      readPendingCount: async (contract) => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return io.readPendingCount(contract);
      },
    };

    const { log } = await check(counted);

    expect(log).toEqual([
      "check-node",
      "check-balances",
      `check-pending-${CONTRACT}`,
      `check-pending-${other}`,
    ]);
    expect(most).toBe(1);
  });

  it("sends one alert, from a step of its own, listing every problem", async () => {
    const low = HEALTH_SETTINGS.minEthWei - 1n;

    const { log, alert } = await check(
      deps({ eth: { [ORACLE]: low }, pending: [[id(1), 7 * HOUR]] }),
    );

    expect(log).toEqual(["check-node", "check-balances", `check-pending-${CONTRACT}`, "alert"]);
    expect(alert).toHaveBeenCalledExactlyOnceWith(
      `oracle ${ORACLE} holds 0.004999999999999999 ETH, under 0.005\n1 rating requests pending over 6 h; the oldest, ${id(1)} on ${CONTRACT}, for 7 h`,
    );
  });
});

describe("runHealthCheck: the DKG node", () => {
  it.each<[string, Awaited<ReturnType<HealthDeps["readNodeStatus"]>>, string]>([
    ["does not answer", { ok: false, reason: "unreachable" }, "unreachable"],
    ["answers with an error", { ok: false, reason: "unexpected", status: 502 }, "unexpected (502)"],
    [
      "refuses the status read",
      { ok: false, reason: "unauthorized", status: 401 },
      "unauthorized (401)",
    ],
  ])("alerts when the node %s", async (_, status, reason) => {
    const { problems } = await check(deps({}, { readNodeStatus: async () => status }));

    expect(problems).toEqual([`DKG node ${NODE}: status check failed, ${reason}`]);
  });

  it.each([
    ["accepted", "chain-pending"],
    ["authority-resolution-failed", "finalized-chain"],
  ])("alerts when the environment's graph is %s from %s", async (authorityState, policySource) => {
    const { problems } = await check(
      deps(
        {},
        { readNodeStatus: async () => ({ ok: true, graph: { authorityState, policySource } }) },
      ),
    );

    expect(problems).toEqual([`DKG node: ${GRAPH} is ${authorityState}/${policySource}`]);
  });

  it("alerts when the node does not list the environment's graph", async () => {
    const { problems } = await check(
      deps({}, { readNodeStatus: async () => ({ ok: true, graph: undefined }) }),
    );

    expect(problems).toEqual([`DKG node: ${GRAPH} is not listed`]);
  });

  it("lists the node's problem first, in the one alert", async () => {
    const low = HEALTH_SETTINGS.minEthWei - 1n;

    const { alert } = await check(
      deps(
        { eth: { [ORACLE]: low } },
        { readNodeStatus: async () => ({ ok: false, reason: "unreachable" }) },
      ),
    );

    expect(alert).toHaveBeenCalledExactlyOnceWith(
      `DKG node ${NODE}: status check failed, unreachable
oracle ${ORACLE} holds 0.004999999999999999 ETH, under 0.005`,
    );
  });
});

describe("createHealthCheck", () => {
  it("runs every hour, a singleton that skips an hour while the last check runs", () => {
    const fn = createHealthCheck(
      new Inngest({ id: "labstrail-test" }),
      () => deps({}),
      async () => {},
    );

    expect(fn.opts.id).toBe("check-health");
    expect(fn.opts.triggers).toEqual([{ cron: HEALTH_SETTINGS.cron }]);
    expect(fn.opts.singleton).toEqual({ mode: "skip" });
  });
});
