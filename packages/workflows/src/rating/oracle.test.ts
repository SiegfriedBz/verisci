import {
  cancelCalldata,
  fulfilCalldata,
  type RatingRequestState,
  type ReadRequestResult,
} from "@labstrail/contracts";
import { Inngest, NonRetriableError } from "inngest";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  createOracleTransaction,
  ORACLE_SETTINGS,
  type OracleChain,
  type OracleInput,
  type OracleSteps,
  parseOracleInput,
  runOracle,
  type SendResult,
} from "./oracle.ts";

const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const ACCOUNT = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const REQUEST_ID = `0x${"ab".repeat(32)}` as Hex;
const R_KA = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/12";
const OTHER_R_KA = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/13";
const GWEI = 1_000_000_000n;
const FEES = { maxFeePerGas: 2n * GWEI, maxPriorityFeePerGas: GWEI / 10n };
const CAP = ORACLE_SETTINGS.feeCapWei;

const FULFIL: OracleInput = {
  contract: CONTRACT,
  requestId: REQUEST_ID,
  action: { kind: "fulfil", score: 72, rKaUal: R_KA },
};
const CANCEL: OracleInput = {
  contract: CONTRACT,
  requestId: REQUEST_ID,
  action: { kind: "cancel", reason: "invalid-target" },
};

const PENDING: RatingRequestState = {
  status: "pending",
  cancelReason: "none",
  requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  requestedAt: 1_791_639_437,
  score: 0,
  targetUal: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7",
  rKaUal: "",
};
const request = (state: Partial<RatingRequestState>): ReadRequestResult => ({
  ok: true,
  request: { ...PENDING, ...state },
});

const MS: Record<string, number> = { "5s": 5_000, "15s": 15_000 };

/** Steps that run at once, keep each output as JSON as Inngest does, and move a clock on sleeps. */
function fakeSteps() {
  const log: string[] = [];
  let clock = 1_800_000_000_000;
  const step: OracleSteps = {
    async run(id, fn) {
      log.push(id);
      return JSON.parse(JSON.stringify(await fn()));
    },
    async sleep(id, duration) {
      log.push(`sleep ${id} ${duration}`);
      clock += MS[duration] ?? 0;
    },
  };
  return { step, log, now: () => clock };
}

interface Script {
  nonces?: ({ latest: number; pending: number } | "down")[];
  requests?: ReadRequestResult[];
  oracle?: string;
  fees?: typeof FEES;
  sends?: SendResult[];
  receipts?: Record<string, ("none" | "success" | "reverted" | "down")[]>;
}

/** A chain answering from `script`; each list repeats its last answer. */
function fakeChain(script: Script, now: () => number) {
  const next = <T>(answers: T[]): T =>
    answers.length > 1 ? (answers.shift() as T) : (answers[0] as T);
  const nonces = [...(script.nonces ?? [{ latest: 4, pending: 4 }])];
  const requests = [...(script.requests ?? [request({})])];
  const sends = [...(script.sends ?? [{ ok: true as const, hash: "0xa1" as Hex }])];
  const scripted: NonNullable<Script["receipts"]> = script.receipts ?? { "0xa1": ["success"] };
  const receipts = Object.fromEntries(
    Object.entries(scripted).map(([hash, list]) => [hash, [...list]]),
  );
  const chain = {
    account: ACCOUNT,
    now,
    nonces: vi.fn(async () => {
      const answer = next(nonces);
      return answer === "down" ? { ok: false as const } : { ok: true as const, ...answer };
    }),
    readRequest: vi.fn(async () => next(requests)),
    readOracle: vi.fn(async () => ({ ok: true as const, oracle: script.oracle ?? ACCOUNT })),
    estimateFees: vi.fn(async () => ({ ok: true as const, fees: script.fees ?? FEES })),
    send: vi.fn(async () => next(sends)),
    receipt: vi.fn(async (hash: Hex) => {
      const list = receipts[hash];
      const state = list ? next(list) : "none";
      return state === "down" ? { ok: false as const } : { ok: true as const, state };
    }),
  } satisfies OracleChain;
  return chain;
}

function oracle(input: OracleInput, script: Script) {
  const { step, log, now } = fakeSteps();
  const chain = fakeChain(script, now);
  const logger = { error: vi.fn() };
  const alert = vi.fn(async (_message: string) => {});
  return { run: runOracle(input, step, chain, logger, alert), chain, log, logger, alert };
}

describe("runOracle", () => {
  it("sends fulfilPhase1 at the latest nonce with the chain's fees, then checks the receipt", async () => {
    const { run, chain, log } = oracle(FULFIL, {});

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(chain.send).toHaveBeenCalledWith({
      to: CONTRACT,
      data: fulfilCalldata(REQUEST_ID, 72, R_KA),
      nonce: 4,
      fees: FEES,
    });
    expect(log).toEqual(["send-1", "sleep receipt-wait-1-1 5s", "receipt-1-1"]);
  });

  it("sends cancelRequest for a cancel", async () => {
    const { run, chain } = oracle(CANCEL, {});

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(chain.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: cancelCalldata(REQUEST_ID, "invalid-target") }),
    );
  });

  it("caps the chain's fee estimate at the fee cap", async () => {
    const { run, chain } = oracle(FULFIL, {
      fees: { maxFeePerGas: 3n * CAP, maxPriorityFeePerGas: 2n * CAP },
    });

    await run;
    expect(chain.send).toHaveBeenCalledWith(
      expect.objectContaining({ fees: { maxFeePerGas: CAP, maxPriorityFeePerGas: CAP } }),
    );
  });

  it("sends nothing for a request already fulfilled with the same R-KA", async () => {
    const { run, chain } = oracle(FULFIL, {
      requests: [request({ status: "fulfilled", score: 72, rKaUal: R_KA })],
    });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(chain.send).not.toHaveBeenCalled();
  });

  it("sends nothing to cancel a request already cancelled", async () => {
    const { run, chain } = oracle(CANCEL, {
      requests: [request({ status: "cancelled", cancelReason: "expired" })],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "expired" });
    expect(chain.send).not.toHaveBeenCalled();
  });

  it("answers fulfilled with the chain's rating to a cancel that came too late", async () => {
    const { run, chain } = oracle(CANCEL, {
      requests: [request({ status: "fulfilled", score: 55, rKaUal: OTHER_R_KA })],
    });

    expect(await run).toEqual({ state: "fulfilled", score: 55, rKaUal: OTHER_R_KA });
    expect(chain.send).not.toHaveBeenCalled();
  });

  it("answers cancelled, with the chain's reason, to a fulfil for a cancelled request", async () => {
    const { run, chain } = oracle(FULFIL, {
      requests: [request({ status: "cancelled", cancelReason: "expired" })],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "expired" });
    expect(chain.send).not.toHaveBeenCalled();
  });

  it("fails without a transaction when the request was fulfilled with another R-KA", async () => {
    const { run, chain, logger } = oracle(FULFIL, {
      requests: [request({ status: "fulfilled", score: 40, rKaUal: OTHER_R_KA })],
    });

    await expect(run).rejects.toThrow(NonRetriableError);
    await expect(run).rejects.toThrow(/^oracle-failed:oracle-conflict: /);
    expect(chain.send).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^oracle-conflict: /));
  });

  it("sends nothing when the contract's oracle is not this key", async () => {
    const { run, chain } = oracle(FULFIL, { oracle: "0x0000000000000000000000000000000000000001" });

    expect(await run).toEqual({ state: "not-our-oracle" });
    expect(chain.send).not.toHaveBeenCalled();
  });

  it("answers unknown when the contract no longer knows the request", async () => {
    const { run, chain } = oracle(FULFIL, { requests: [request({ status: "none" })] });

    expect(await run).toEqual({ state: "unknown" });
    expect(chain.send).not.toHaveBeenCalled();
  });

  it("waits 15 s while a transaction is in flight, sending nothing until it lands", async () => {
    const { run, chain, log } = oracle(FULFIL, {
      nonces: [
        { latest: 4, pending: 5 },
        { latest: 4, pending: 5 },
        { latest: 5, pending: 5 },
      ],
    });

    await run;
    expect(log.slice(0, 5)).toEqual([
      "send-1",
      "sleep wait-1 15s",
      "send-2",
      "sleep wait-2 15s",
      "send-3",
    ]);
    expect(chain.send).toHaveBeenCalledOnce();
    expect(chain.send).toHaveBeenCalledWith(expect.objectContaining({ nonce: 5 }));
  });

  it("replaces a nonce in flight for 10 minutes with a transfer to itself above the fee cap", async () => {
    const busyChecks = ORACLE_SETTINGS.busyLimitMs / 15_000 + 1;
    const { run, chain, log } = oracle(FULFIL, {
      nonces: [
        ...Array.from({ length: busyChecks }, () => ({ latest: 4, pending: 5 })),
        { latest: 4, pending: 5 },
        { latest: 5, pending: 5 },
      ],
      sends: [
        { ok: true, hash: "0xb0" },
        { ok: true, hash: "0xa1" },
      ],
    });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    const raised = (CAP * 115n + 99n) / 100n;
    expect(chain.send).toHaveBeenNthCalledWith(1, {
      to: ACCOUNT,
      data: "0x",
      nonce: 4,
      fees: { maxFeePerGas: raised, maxPriorityFeePerGas: raised },
    });
    expect(chain.send).toHaveBeenNthCalledWith(2, expect.objectContaining({ nonce: 5 }));
    expect(log).toContain(`unstick-${busyChecks}`);
  });

  it("raises both fees by 15% at the same nonce when nothing is mined after 60 s", async () => {
    const polls = ORACLE_SETTINGS.bumpAfterMs / 5_000;
    const { run, chain, log } = oracle(FULFIL, {
      sends: [
        { ok: true, hash: "0xa1" },
        { ok: true, hash: "0xa2" },
      ],
      receipts: { "0xa1": ["none"], "0xa2": ["success"] },
    });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(chain.send).toHaveBeenNthCalledWith(2, {
      to: CONTRACT,
      data: fulfilCalldata(REQUEST_ID, 72, R_KA),
      nonce: 4,
      fees: {
        maxFeePerGas: (FEES.maxFeePerGas * 115n + 99n) / 100n,
        maxPriorityFeePerGas: (FEES.maxPriorityFeePerGas * 115n + 99n) / 100n,
      },
    });
    expect(log).toContain(`receipt-1-${polls}`);
    expect(chain.receipt).toHaveBeenCalledWith("0xa2");
  });

  it("finds the mined replacement when an earlier hash's receipt cannot be read", async () => {
    const polls = ORACLE_SETTINGS.bumpAfterMs / 5_000;
    const { run, chain } = oracle(FULFIL, {
      sends: [
        { ok: true, hash: "0xa1" },
        { ok: true, hash: "0xa2" },
      ],
      receipts: {
        "0xa1": [...Array.from({ length: polls }, () => "none" as const), "down"],
        "0xa2": ["success"],
      },
    });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(chain.send).toHaveBeenCalledTimes(2);
  });

  it("sends no raise past the fee cap, logs it and alerts on it once, and keeps checking", async () => {
    const { run, chain, logger, alert, log } = oracle(FULFIL, {
      fees: { maxFeePerGas: CAP, maxPriorityFeePerGas: GWEI },
      receipts: { "0xa1": [...Array.from({ length: 20 }, () => "none" as const), "success"] },
    });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(chain.send).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^oracle-at-fee-cap: /));
    expect(alert).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^oracle-at-fee-cap: /));
    expect(log.filter((id) => id === "alert-fee-cap")).toHaveLength(1);
  });

  it("reads the request again after a reverted receipt, and converges", async () => {
    const { run, chain } = oracle(FULFIL, {
      requests: [request({}), request({ status: "fulfilled", score: 72, rKaUal: R_KA })],
      receipts: { "0xa1": ["reverted"] },
    });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(chain.send).toHaveBeenCalledOnce();
    expect(chain.readRequest).toHaveBeenCalledTimes(2);
  });

  it("sends again when another transaction took its nonce", async () => {
    const { run, chain } = oracle(FULFIL, {
      nonces: [
        { latest: 4, pending: 4 },
        { latest: 5, pending: 5 },
      ],
      sends: [
        { ok: true, hash: "0xa1" },
        { ok: true, hash: "0xa2" },
      ],
      receipts: { "0xa1": ["none"], "0xa2": ["success"] },
    });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(chain.send).toHaveBeenNthCalledWith(2, expect.objectContaining({ nonce: 5 }));
  });

  it("treats a send refused as in flight like a transaction in flight", async () => {
    const { run, chain, log } = oracle(FULFIL, {
      sends: [
        { ok: false, reason: "in-flight" },
        { ok: true, hash: "0xa1" },
      ],
    });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(log.slice(0, 3)).toEqual(["send-1", "sleep wait-1 15s", "send-2"]);
    expect(chain.send).toHaveBeenCalledTimes(2);
  });

  it("logs an oracle without funds, alerts on it once, and tries again", async () => {
    const { run, logger, alert, log } = oracle(FULFIL, {
      sends: [
        { ok: false, reason: "no-funds" },
        { ok: false, reason: "no-funds" },
        { ok: false, reason: "no-funds" },
        { ok: true, hash: "0xa1" },
      ],
    });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^oracle-no-funds: /));
    expect(alert).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^oracle-no-funds: /));
    expect(log.filter((id) => id === "alert-no-funds")).toHaveLength(1);
  });

  it("retries a chain that does not answer every 15 s, then fails oracle-stuck", async () => {
    const { run, chain } = oracle(FULFIL, { nonces: ["down"] });

    await expect(run).rejects.toThrow(/^oracle-failed:oracle-stuck: /);
    expect(chain.send).not.toHaveBeenCalled();
    expect(chain.nonces.mock.calls.length).toBe(ORACLE_SETTINGS.budgetMs / 15_000 + 1);
  });
});

describe("parseOracleInput", () => {
  it("accepts a fulfil and a cancel", () => {
    expect(parseOracleInput(FULFIL)).toEqual(FULFIL);
    expect(parseOracleInput(CANCEL)).toEqual(CANCEL);
  });

  it.each([
    ["no action", { contract: CONTRACT, requestId: REQUEST_ID }],
    ["a score above 100", { ...FULFIL, action: { kind: "fulfil", score: 101, rKaUal: R_KA } }],
    ["an unknown reason", { ...CANCEL, action: { kind: "cancel", reason: "owner" } }],
    ["an uppercase contract", { ...FULFIL, contract: CONTRACT.toUpperCase() }],
  ])("stops the run on %s", (_, data) => {
    expect(() => parseOracleInput(data)).toThrow(/^oracle-failed:setup: /);
  });
});

describe("createOracleTransaction", () => {
  const fn = createOracleTransaction(
    new Inngest({ id: "labstrail-test" }),
    () => {
      throw new Error("unused");
    },
    async () => {},
  );

  it("runs one step at a time, only when a rating run invokes it", () => {
    expect(fn.opts.id).toBe("oracle-transaction");
    expect(fn.opts.concurrency).toEqual({ limit: 1 });
    expect(fn.opts.triggers ?? []).toEqual([]);
    expect(fn.opts.timeouts).toEqual({ finish: "30m" });
  });
});
