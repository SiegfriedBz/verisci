import { type PaperMetadata, targetKaQuads } from "@labstrail/core";
import type { AssetResult, DkgClient, MintResult } from "@labstrail/dkg";
import { Inngest, NonRetriableError } from "inngest";
import { describe, expect, it, vi } from "vitest";
import type { Notice } from "../alerts/notify.ts";
import type { FieldCheckResult } from "./field-check.ts";
import {
  createPublishPaper,
  loadDeps,
  PUBLISH_SETTINGS,
  type PublishDeps,
  type PublishSteps,
  publishFailureReason,
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
const SITE = "https://labstrail.example";
const METADATA: PaperMetadata = {
  title: "A Title",
  authors: ["Ada Lovelace"],
  abstract: "A trial of citicoline after stroke.",
};
const OPENING = "Introduction\nStroke is a leading cause of disability.";
const PAPER = { ok: true as const, metadata: METADATA, opening: OPENING };
const IN_FIELD: FieldCheckResult = {
  ok: true,
  field: "life-sciences",
  reason: "A stroke trial.",
  model: "gemini-3.5-flash-lite-001",
};
const OUTSIDE: FieldCheckResult = {
  ok: true,
  field: "outside",
  reason: "A physics paper on gravitational waves.",
  model: "gemini-3.5-flash-lite-001",
};

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
  fields?: FieldCheckResult[];
  stores?: AssetResult[];
  mints?: MintResult[];
}

/** Adapters answering from `script`; reads and mints repeat their last answer. */
function fakeDeps(script: Script) {
  const reads = [...(script.reads ?? [missing])];
  const stores = [...(script.stores ?? [stored])];
  const mints = [...(script.mints ?? [mintedNow])];
  const papers = [...(script.papers ?? [PAPER])];
  const fields = [...(script.fields ?? [IN_FIELD])];
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
    checkField: vi.fn(async () => next(fields)),
    dkg: dkg as unknown as Pick<DkgClient, "readAsset" | "storeAsset" | "startMint">,
    notify: vi.fn(async (_notice: Notice) => {}),
    siteUrl: SITE,
  };
  return { deps, dkg };
}

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

async function publish(script: Script) {
  const { step, log } = fakeSteps();
  const { deps, dkg } = fakeDeps(script);
  const logger = fakeLogger();
  const run = runPublish(SUBMISSION, step, deps, RECEIVED_AT, logger);
  return { run, log, deps, dkg, logger };
}

describe("runPublish", () => {
  it("reads the paper in one step, stores it, mints it and returns the UAL", async () => {
    const { run, log, deps, dkg } = await publish({});

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toEqual([
      "verify",
      "read-1",
      "parse-paper-1",
      "check-field-1",
      "store-1",
      "mint-1",
      "notify",
    ]);
    expect(deps.readPaper).toHaveBeenCalledWith(CID);
    expect(dkg.storeAsset).toHaveBeenCalledWith(
      NAME,
      expect.arrayContaining([expect.objectContaining({ object: '"A Title"' })]),
    );
    expect(dkg.startMint).toHaveBeenCalledWith(NAME, { listenMs: PUBLISH_SETTINGS.listenMs });
    expect(deps.notify).toHaveBeenCalledExactlyOnceWith({
      level: "activity",
      text: "📄 Published",
      title: "A Title",
      link: { label: "Open the paper", url: `${SITE}/papers/${CID}` },
    });
  });

  it("returns the UAL of a KA already minted, with no fetch, parse, store or message", async () => {
    const { run, log, deps, dkg } = await publish({ reads: [minted] });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toEqual(["verify", "read-1"]);
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(dkg.storeAsset).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("mints a KA already stored without reading the paper or storing, naming it by its CID", async () => {
    const { run, log, deps, dkg } = await publish({ reads: [stored] });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toEqual(["verify", "read-1", "mint-1", "notify"]);
    expect(deps.notify).toHaveBeenCalledExactlyOnceWith({
      level: "activity",
      text: "📄 Published",
      title: CID,
      link: { label: "Open the paper", url: `${SITE}/papers/${CID}` },
    });
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
      "parse-paper-1",
      "check-field-1",
      "store-1",
      "mint-1",
      "sleep wait-1-1 30s",
      "poll-1-1",
      "sleep wait-1-2 30s",
      "poll-1-2",
      "sleep wait-1-3 30s",
      "poll-1-3",
      "notify",
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
    await expect(run).rejects.toThrow(/^publish-failed:mint-not-confirmed: /);
    expect(log.filter((entry) => entry.startsWith("mint-"))).toHaveLength(
      PUBLISH_SETTINGS.attempts,
    );
    expect(log.some((entry) => entry.startsWith("sleep retry-"))).toBe(false);
  });

  it("shares a draft without reading the paper again", async () => {
    const { run, log, deps, dkg } = await publish({ reads: [{ ok: true, state: "draft" }] });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toEqual(["verify", "read-1", "store-1", "mint-1", "notify"]);
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(dkg.storeAsset).toHaveBeenCalledWith(NAME, []);
  });

  it("reads the paper again when a draft is gone before the store", async () => {
    const { run, log } = await publish({
      reads: [{ ok: true, state: "draft" }, missing],
      stores: [{ ok: false, reason: "no-content" }, stored],
    });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toContain("sleep retry-1 2m");
    expect(log).toContain("parse-paper-2");
  });

  it("returns the UAL when the store finds the KA already minted", async () => {
    const { run, log, dkg } = await publish({ stores: [minted] });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toEqual(["verify", "read-1", "parse-paper-1", "check-field-1", "store-1"]);
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
        papers: [{ ok: false, reason: "unreachable" }, PAPER],
      },
    ],
    [
      "an unexpected answer on the store",
      { stores: [{ ok: false, reason: "unexpected", status: 500 }, stored] },
    ],
  ])("sleeps 2 minutes after %s, then does what is left", async (_, script) => {
    const { step, log } = fakeSteps();
    const { deps } = fakeDeps(script);

    expect(await runPublish(SUBMISSION, step, deps, RECEIVED_AT, fakeLogger())).toEqual({
      state: "minted",
      ual: UAL,
    });
    expect(log).toContain("sleep retry-1 2m");
    expect(log).toContain("read-2");
  });

  it("fails after 5 attempts", async () => {
    const { run, log } = await publish({ reads: [{ ok: false, reason: "unreachable" }] });

    await expect(run).rejects.toThrow(NonRetriableError);
    await expect(run).rejects.toThrow(/^publish-failed:node-unreachable: /);
    expect(log.filter((entry) => entry.startsWith("read-"))).toEqual([
      "read-1",
      "read-2",
      "read-3",
      "read-4",
      "read-5",
    ]);
    expect(log.filter((entry) => entry.startsWith("sleep retry-"))).toHaveLength(4);
  });

  it("fails network-refused when the network declines every attempt's mint", async () => {
    const { run, dkg } = await publish({
      reads: [stored],
      mints: [{ ok: false, reason: "retry-later" }],
    });

    await expect(run).rejects.toThrow(/^publish-failed:network-refused: /);
    expect(dkg.startMint).toHaveBeenCalledTimes(PUBLISH_SETTINGS.attempts);
  });

  it("still fails node-unreachable when the node never answers the mint", async () => {
    const { run } = await publish({
      reads: [stored],
      mints: [{ ok: false, reason: "unreachable" }],
    });

    await expect(run).rejects.toThrow(/^publish-failed:node-unreachable: /);
  });

  it("fails with the last attempt's reason when the mint's failures change", async () => {
    const declined: MintResult = { ok: false, reason: "retry-later" };
    const { run } = await publish({
      reads: [stored],
      mints: [declined, declined, declined, declined, { ok: false, reason: "unreachable" }],
    });

    await expect(run).rejects.toThrow(/^publish-failed:node-unreachable: /);
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
    deps.verifySubmission.mockResolvedValueOnce({
      ok: false,
      reason: "unreachable",
      detail: "rpc down",
    });

    expect(await runPublish(SUBMISSION, step, deps, RECEIVED_AT, fakeLogger())).toEqual({
      state: "minted",
      ual: UAL,
    });
    expect(log.slice(0, 3)).toEqual(["verify", "sleep verify-retry-1 2m", "verify-2"]);
  });

  it("checks every verify attempt against the time the event was received", async () => {
    const { step } = fakeSteps();
    const { deps } = fakeDeps({});
    deps.verifySubmission.mockResolvedValueOnce({
      ok: false,
      reason: "unreachable",
      detail: "rpc down",
    });

    await runPublish(SUBMISSION, step, deps, RECEIVED_AT, fakeLogger());

    expect(deps.verifySubmission.mock.calls).toEqual([
      [SUBMISSION, RECEIVED_AT],
      [SUBMISSION, RECEIVED_AT],
    ]);
  });

  it("fails when the signature still cannot be checked after 5 attempts", async () => {
    const { run, log } = await publish({
      verify: { ok: false, reason: "unreachable", detail: "rpc down" },
    });

    await expect(run).rejects.toThrow(NonRetriableError);
    await expect(run).rejects.toThrow(/^publish-failed:chain-unreachable: /);
    expect(log.filter((entry) => entry.startsWith("sleep verify-retry-"))).toHaveLength(4);
  });

  it("fails when the paper still cannot be read after 5 attempts", async () => {
    const { run } = await publish({ papers: [{ ok: false, reason: "unreachable" }] });

    await expect(run).rejects.toThrow(/^publish-failed:paper-unreachable: /);
  });

  it("fails at once when GROBID refuses our credential", async () => {
    const { run, log } = await publish({ papers: [{ ok: false, reason: "unauthorized" }] });

    await expect(run).rejects.toThrow(NonRetriableError);
    await expect(run).rejects.toThrow(/^publish-failed:setup: /);
    expect(log).toEqual(["verify", "read-1", "parse-paper-1"]);
  });

  it.each(["not-a-pdf", "too-large", "unparseable", "no-title", "unreadable", "no-text"] as const)(
    "ends refused when the paper is %s, with nothing stored",
    async (reason) => {
      const { run, dkg } = await publish({ papers: [{ ok: false, reason }] });

      expect(await run).toEqual({ state: "refused", reason });
      expect(dkg.storeAsset).not.toHaveBeenCalled();
    },
  );

  it("checks a new paper's field after reading it, then stores the same triples as before", async () => {
    const { run, log, deps, dkg } = await publish({});

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log.slice(0, 5)).toEqual([
      "verify",
      "read-1",
      "parse-paper-1",
      "check-field-1",
      "store-1",
    ]);
    expect(deps.checkField).toHaveBeenCalledWith({
      title: METADATA.title,
      abstract: METADATA.abstract,
      opening: OPENING,
    });
    expect(dkg.storeAsset).toHaveBeenCalledWith(
      NAME,
      targetKaQuads(METADATA, { ...SUBMISSION, deadline: BigInt(SUBMISSION.deadline) }),
    );
  });

  it("asks without the abstract's field when the paper has none", async () => {
    const { run, deps } = await publish({
      papers: [{ ...PAPER, metadata: { title: "A Title", authors: [] } }],
    });

    await run;
    expect(deps.checkField).toHaveBeenCalledWith({ title: "A Title", opening: OPENING });
  });

  it("ends refused outside-field with nothing stored or minted, and logs Gemini's reason with the CID", async () => {
    const { run, log, dkg, logger } = await publish({ fields: [OUTSIDE] });

    expect(await run).toEqual({ state: "refused", reason: "outside-field" });
    expect(log).toEqual(["verify", "read-1", "parse-paper-1", "check-field-1"]);
    expect(dkg.storeAsset).not.toHaveBeenCalled();
    expect(dkg.startMint).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      `outside-field: ${CID}: A physics paper on gravitational waves.`,
    );
  });

  it("waits 30 s after a failed check and asks once more", async () => {
    const { run, log, deps } = await publish({
      fields: [{ ok: false, reason: "rate-limited", status: 429 }, OUTSIDE],
    });

    expect(await run).toEqual({ state: "refused", reason: "outside-field" });
    expect(log).toEqual([
      "verify",
      "read-1",
      "parse-paper-1",
      "check-field-1",
      "sleep check-field-wait-1 30s",
      "check-field-1-again",
    ]);
    expect(deps.checkField).toHaveBeenCalledTimes(2);
  });

  it("fails as setup at once when Gemini refuses the request, with nothing stored", async () => {
    const { run, log, dkg } = await publish({
      fields: [{ ok: false, reason: "refused", status: 400 }],
    });

    await expect(run).rejects.toThrow(NonRetriableError);
    await expect(run).rejects.toThrow(/^publish-failed:setup: .*Gemini refused .*400/);
    expect(log).toEqual(["verify", "read-1", "parse-paper-1", "check-field-1"]);
    expect(dkg.storeAsset).not.toHaveBeenCalled();
  });

  it("fails as setup when Gemini refuses the second ask", async () => {
    const { run, log, dkg } = await publish({
      fields: [
        { ok: false, reason: "unreachable" },
        { ok: false, reason: "refused", status: 403 },
      ],
    });

    await expect(run).rejects.toThrow(/^publish-failed:setup: .*Gemini refused .*403/);
    expect(log).toContain("check-field-1-again");
    expect(dkg.storeAsset).not.toHaveBeenCalled();
  });

  it("publishes the paper and logs field-unchecked when the check fails twice", async () => {
    const { run, log, deps, logger } = await publish({
      fields: [
        { ok: false, reason: "unreachable" },
        { ok: false, reason: "rate-limited", status: 429 },
      ],
    });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(log).toContain("check-field-1-again");
    expect(log).toContain("store-1");
    expect(deps.checkField).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(`field-unchecked: ${CID}: rate-limited (HTTP 429)`);
  });

  it("logs a failure without an HTTP status as such", async () => {
    const { run, logger } = await publish({ fields: [{ ok: false, reason: "unreachable" }] });

    await run;
    expect(logger.warn).toHaveBeenCalledWith(`field-unchecked: ${CID}: unreachable`);
  });

  it.each<[string, FieldCheckResult[]]>([
    ["answered", [IN_FIELD]],
    ["could not answer", [{ ok: false, reason: "unreachable" }]],
  ])(
    "reads the paper again on attempt 2 but asks nothing when the check %s on attempt 1",
    async (_, fields) => {
      const { run, log, deps } = await publish({
        fields,
        stores: [{ ok: false, reason: "unexpected", status: 500 }, stored],
      });

      expect(await run).toEqual({ state: "minted", ual: UAL });
      expect(log).toContain("parse-paper-2");
      expect(log.filter((entry) => entry.startsWith("check-field-2"))).toEqual([]);
      expect(deps.checkField).toHaveBeenCalledTimes(fields[0]?.ok ? 1 : 2);
    },
  );

  it.each<[string, AssetResult]>([
    ["a draft stored by an earlier run", { ok: true, state: "draft" }],
    ["an asset already minted", minted],
  ])("asks nothing for %s", async (_, read) => {
    const { run, deps } = await publish({ reads: [read] });

    expect(await run).toEqual({ state: "minted", ual: UAL });
    expect(deps.checkField).not.toHaveBeenCalled();
  });

  it.each(["unauthorized", "graph-not-served"] as const)(
    "fails at once on %s, with no retry",
    async (reason) => {
      const { run, log } = await publish({ reads: [{ ok: false, reason }] });

      await expect(run).rejects.toThrow(NonRetriableError);
      await expect(run).rejects.toThrow(/^publish-failed:setup: /);
      expect(log).toEqual(["verify", "read-1"]);
    },
  );
});

describe("createPublishPaper", () => {
  const fn = createPublishPaper(new Inngest({ id: "labstrail-test" }), () => fakeDeps({}).deps);

  it("runs on labstrail/paper.submitted as a singleton per CID, skipping new runs", () => {
    expect(fn.opts.triggers).toEqual([{ event: "labstrail/paper.submitted" }]);
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
    expect(load).toThrow(/^publish-failed:setup: /);
  });
});

describe("publishFailureReason", () => {
  it("finds the reason a failed run's error carries, wherever Inngest nests it", () => {
    const error = { name: "NonRetriableError", message: "publish-failed:node-unreachable: x" };

    expect(publishFailureReason(error)).toBe("node-unreachable");
    expect(publishFailureReason({ error })).toBe("node-unreachable");
    expect(publishFailureReason(JSON.stringify([{ op: "StepFailed", error }]))).toBe(
      "node-unreachable",
    );
    expect(publishFailureReason({ message: "publish-failed:network-refused: x" })).toBe(
      "network-refused",
    );
  });

  it("finds none in an error that carries no known reason", () => {
    expect(publishFailureReason({ message: "boom" })).toBeUndefined();
    expect(publishFailureReason({ message: "publish-failed:odd: x" })).toBeUndefined();
    expect(publishFailureReason(undefined)).toBeUndefined();
  });
});
