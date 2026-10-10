import type { PaperMetadata } from "@verisci/core";
import type { AssetResult, DkgClient, MintResult } from "@verisci/dkg";
import { Inngest, NonRetriableError } from "inngest";
import { describe, expect, it, vi } from "vitest";
import {
  createPublishPaper,
  loadDeps,
  PUBLISH_SETTINGS,
  type PublishDeps,
  type PublishSteps,
  runPublish,
} from "./publish-paper.ts";
import type { VerifyResult } from "./verify-submission.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const NAME = `verisci-tka-${CID}`;
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const SUBMISSION = {
  cid: CID,
  contextGraph: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-staging",
  deadline: "1800000600",
  submitter: "0xabc0000000000000000000000000000000000001",
  signature: "0x1234",
};
/** When Inngest received the event, in milliseconds. */
const RECEIVED_AT = 1_800_000_000_000;
const METADATA: PaperMetadata = { title: "A Title", authors: ["Ada Lovelace"] };

const missing: AssetResult = { ok: true, state: "missing" };
const stored: AssetResult = { ok: true, state: "stored", reservedUal: UAL };
const minted: AssetResult = { ok: true, state: "minted", ual: UAL };
const minting: MintResult = { ok: true, state: "minting" };
const mintedNow: MintResult = { ok: true, state: "minted", ual: UAL };

/** Steps that run at once and record every step id and sleep, as Inngest would in order. */
function fakeSteps() {
  const log: string[] = [];
  const step: PublishSteps = {
    async run(id, fn) {
      log.push(id);
      return fn();
    },
    async sleep(id, duration) {
      log.push(`sleep ${id} ${duration}`);
    },
  };
  return { step, log };
}

interface Script {
  verify?: VerifyResult;
  reads?: AssetResult[];
  papers?: Awaited<ReturnType<PublishDeps["readPaper"]>>[];
  stores?: AssetResult[];
  mints?: MintResult[];
}

/** Adapters answering from `script`; reads and mints repeat their last answer. */
function fakeDeps(script: Script) {
  const reads = [...(script.reads ?? [missing])];
  const stores = [...(script.stores ?? [stored])];
  const mints = [...(script.mints ?? [mintedNow])];
  const papers = [...(script.papers ?? [{ ok: true as const, metadata: METADATA }])];
  const next = <T>(answers: T[]): T =>
    answers.length > 1 ? (answers.shift() as T) : (answers[0] as T);
  const dkg = {
    readAsset: vi.fn(async () => next(reads)),
    storeAsset: vi.fn(async () => next(stores)),
    startMint: vi.fn(async () => next(mints)),
  };
  const deps = {
    verifySubmission: vi.fn(
      async () => script.verify ?? { ok: true as const, submission: SUBMISSION },
    ),
    readPaper: vi.fn(async () => next(papers)),
    dkg: dkg as unknown as Pick<DkgClient, "readAsset" | "storeAsset" | "startMint">,
  };
  return { deps, dkg };
}

async function publish(script: Script) {
  const { step, log } = fakeSteps();
  const { deps, dkg } = fakeDeps(script);
  const run = runPublish(SUBMISSION, step, deps, RECEIVED_AT);
  return { run, log, deps, dkg };
}

describe("runPublish", () => {
  it("reads the paper in one step, stores it, mints it and returns the UAL", async () => {
    const { run, log, deps, dkg } = await publish({});

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toEqual(["verify", "read-1", "read-paper-1", "store-1", "mint-1"]);
    expect(deps.readPaper).toHaveBeenCalledWith(CID);
    expect(dkg.storeAsset).toHaveBeenCalledWith(
      NAME,
      expect.arrayContaining([expect.objectContaining({ object: '"A Title"' })]),
    );
    expect(dkg.startMint).toHaveBeenCalledWith(NAME, { listenMs: PUBLISH_SETTINGS.listenMs });
  });

  it("returns the UAL of a KA already minted, with no fetch, parse or store", async () => {
    const { run, log, deps, dkg } = await publish({ reads: [minted] });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toEqual(["verify", "read-1"]);
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(dkg.storeAsset).not.toHaveBeenCalled();
  });

  it("mints a KA already stored without reading the paper or storing", async () => {
    const { run, log, deps, dkg } = await publish({ reads: [stored] });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toEqual(["verify", "read-1", "mint-1"]);
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(dkg.storeAsset).not.toHaveBeenCalled();
  });

  it("polls every 30 s while the mint runs and returns the UAL once minted", async () => {
    const { run, log } = await publish({
      reads: [missing, stored, stored, minted],
      mints: [minting],
    });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toEqual([
      "verify",
      "read-1",
      "read-paper-1",
      "store-1",
      "mint-1",
      "sleep wait-1-1 30s",
      "poll-1-1",
      "sleep wait-1-2 30s",
      "poll-1-2",
      "sleep wait-1-3 30s",
      "poll-1-3",
    ]);
  });

  it("starts the mint again when the KA is still not minted 10 minutes after", async () => {
    const reads = [
      stored,
      ...Array<AssetResult>(PUBLISH_SETTINGS.pollsPerMint).fill(stored),
      stored,
      minted,
    ];
    const { run, log, dkg } = await publish({ reads, mints: [minting, minting] });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(PUBLISH_SETTINGS.pollsPerMint * 30).toBe(600);
    expect(log).toContain(`poll-1-${PUBLISH_SETTINGS.pollsPerMint}`);
    expect(log).not.toContain(`poll-1-${PUBLISH_SETTINGS.pollsPerMint + 1}`);
    expect(log).toContain("read-2");
    expect(log).toContain("mint-2");
    expect(log).not.toContain("sleep retry-1 2m");
    expect(dkg.startMint).toHaveBeenCalledTimes(2);
  });

  it("fails when the mint is still not seen after 5 attempts", async () => {
    const { run, log } = await publish({ reads: [stored], mints: [minting] });

    await expect(run).rejects.toThrow(NonRetriableError);
    expect(log.filter((entry) => entry.startsWith("mint-"))).toHaveLength(
      PUBLISH_SETTINGS.attempts,
    );
    expect(log.some((entry) => entry.startsWith("sleep retry-"))).toBe(false);
  });

  it("shares a draft without reading the paper again", async () => {
    const { run, log, deps, dkg } = await publish({ reads: [{ ok: true, state: "draft" }] });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toEqual(["verify", "read-1", "store-1", "mint-1"]);
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(dkg.storeAsset).toHaveBeenCalledWith(NAME, []);
  });

  it("returns the UAL when the store finds the KA already minted", async () => {
    const { run, log, dkg } = await publish({ stores: [minted] });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toEqual(["verify", "read-1", "read-paper-1", "store-1"]);
    expect(dkg.startMint).not.toHaveBeenCalled();
  });

  it.each<[string, Script]>([
    [
      "a quorum failure on the mint",
      { reads: [stored], mints: [{ ok: false, reason: "retry-later" }, mintedNow] },
    ],
    ["an unreachable node on the read", { reads: [{ ok: false, reason: "unreachable" }, stored] }],
    [
      "an unreachable node while polling the mint",
      { reads: [stored, { ok: false, reason: "unreachable" }, minted], mints: [minting] },
    ],
    [
      "an unreachable gateway or GROBID",
      {
        papers: [
          { ok: false, reason: "unreachable" },
          { ok: true, metadata: METADATA },
        ],
      },
    ],
    [
      "an unexpected answer on the store",
      { stores: [{ ok: false, reason: "unexpected", status: 500 }, stored] },
    ],
  ])("sleeps 2 minutes after %s, then does what is left", async (_, script) => {
    const { step, log } = fakeSteps();
    const { deps } = fakeDeps(script);

    expect(await runPublish(SUBMISSION, step, deps, RECEIVED_AT)).toEqual({
      state: "minted",
      ual: UAL,
    });
    expect(log).toContain("sleep retry-1 2m");
    expect(log).toContain("read-2");
  });

  it("fails after 5 attempts", async () => {
    const { run, log } = await publish({ reads: [{ ok: false, reason: "unreachable" }] });

    await expect(run).rejects.toThrow(NonRetriableError);
    expect(log.filter((entry) => entry.startsWith("read-"))).toEqual([
      "read-1",
      "read-2",
      "read-3",
      "read-4",
      "read-5",
    ]);
    expect(log.filter((entry) => entry.startsWith("sleep retry-"))).toHaveLength(4);
  });

  it.each(["malformed", "bad-cid", "wrong-graph", "expired", "bad-signature"] as const)(
    "ends refused on a %s submission, with nothing fetched or stored",
    async (reason) => {
      const { run, log, deps, dkg } = await publish({ verify: { ok: false, reason } });

      expect(await run).toEqual({ state: "refused", reason });
      expect(log).toEqual(["verify"]);
      expect(deps.readPaper).not.toHaveBeenCalled();
      expect(dkg.readAsset).not.toHaveBeenCalled();
    },
  );

  it("retries a submission whose signature could not be checked", async () => {
    const { step, log } = fakeSteps();
    const { deps } = fakeDeps({});
    deps.verifySubmission.mockResolvedValueOnce({ ok: false, reason: "unreachable" });

    expect(await runPublish(SUBMISSION, step, deps, RECEIVED_AT)).toEqual({
      state: "minted",
      ual: UAL,
    });
    expect(log.slice(0, 3)).toEqual(["verify", "sleep verify-retry-1 2m", "verify-2"]);
  });

  it("checks every verify attempt against the time the event was received", async () => {
    const { step } = fakeSteps();
    const { deps } = fakeDeps({});
    deps.verifySubmission.mockResolvedValueOnce({ ok: false, reason: "unreachable" });

    await runPublish(SUBMISSION, step, deps, RECEIVED_AT);

    expect(deps.verifySubmission.mock.calls).toEqual([
      [SUBMISSION, RECEIVED_AT],
      [SUBMISSION, RECEIVED_AT],
    ]);
  });

  it("fails when the signature still cannot be checked after 5 attempts", async () => {
    const { run, log } = await publish({ verify: { ok: false, reason: "unreachable" } });

    await expect(run).rejects.toThrow(NonRetriableError);
    expect(log.filter((entry) => entry.startsWith("sleep verify-retry-"))).toHaveLength(4);
  });

  it("fails at once when GROBID refuses our credential", async () => {
    const { run, log } = await publish({ papers: [{ ok: false, reason: "unauthorized" }] });

    await expect(run).rejects.toThrow(NonRetriableError);
    expect(log).toEqual(["verify", "read-1", "read-paper-1"]);
  });

  it.each(["not-a-pdf", "too-large", "unparseable", "no-title"] as const)(
    "ends refused when the paper is %s, with nothing stored",
    async (reason) => {
      const { run, dkg } = await publish({ papers: [{ ok: false, reason }] });

      expect(await run).toEqual({ state: "refused", reason });
      expect(dkg.storeAsset).not.toHaveBeenCalled();
    },
  );

  it.each(["unauthorized", "graph-not-served"] as const)(
    "fails at once on %s, with no retry",
    async (reason) => {
      const { run, log } = await publish({ reads: [{ ok: false, reason }] });

      await expect(run).rejects.toThrow(NonRetriableError);
      expect(log).toEqual(["verify", "read-1"]);
    },
  );
});

describe("createPublishPaper", () => {
  const fn = createPublishPaper(new Inngest({ id: "verisci-test" }), () => fakeDeps({}).deps);

  it("runs on verisci/paper.submitted as a singleton per CID, skipping new runs", () => {
    expect(fn.opts.triggers).toEqual([{ event: "verisci/paper.submitted" }]);
    expect(fn.opts.singleton).toEqual({ key: "event.data.cid", mode: "skip" });
  });

  it("gives a run 45 minutes to finish (ADR 0009)", () => {
    expect(fn.opts.timeouts).toEqual({ finish: "45m" });
  });
});

describe("loadDeps", () => {
  it("returns the adapters", () => {
    const { deps } = fakeDeps({});

    expect(loadDeps(() => deps)).toBe(deps);
  });

  it("stops the run without retries when the settings are missing or invalid", () => {
    const load = () =>
      loadDeps(() => {
        throw new Error("Invalid environment variables:\n  GROBID_URL: Required");
      });

    expect(load).toThrow(NonRetriableError);
    expect(load).toThrow(/GROBID_URL/);
  });
});
