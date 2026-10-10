import type { AssetResult } from "@verisci/dkg";
import { describe, expect, it } from "vitest";
import type { DeleteFileResult, FindFileResult } from "../pinata.ts";
import { PAPER_SUBMITTED } from "./publish-paper.ts";
import { type SubmitDeps, type SubmitLimiter, submitPaper } from "./submit-paper.ts";
import type { VerifiedSubmission, VerifyResult } from "./verify-submission.ts";

const CID = "bafybeicrwkcuhyibpnbzadvjw46tl7s5pl5k5rbf4iaega4x3odats642m";
const SUBMISSION: VerifiedSubmission = {
  cid: CID,
  contextGraph: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-staging",
  deadline: "1800000600",
  submitter: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  signature: "0x1234",
};
const INPUT = { ...SUBMISSION, submitter: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD" };
const PDF_FILE: FindFileResult = {
  ok: true,
  file: { id: "file-1", size: 2_215_703, mimeType: "application/pdf" },
};

interface Fakes {
  verify?: VerifyResult;
  check?: Awaited<ReturnType<SubmitLimiter["check"]>>;
  file?: FindFileResult;
  asset?: AssetResult;
  send?: () => Promise<string>;
}

const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";

function deps(fakes: Fakes = {}) {
  const calls = {
    verified: [] as unknown[],
    checked: [] as string[],
    counted: [] as string[],
    found: [] as string[],
    deleted: [] as string[],
    sent: [] as unknown[],
    read: [] as string[],
  };
  const submitDeps: SubmitDeps = {
    verify: async (data) => {
      calls.verified.push(data);
      return fakes.verify ?? { ok: true, submission: SUBMISSION };
    },
    limiter: {
      check: async (address) => {
        calls.checked.push(address);
        return fakes.check ?? "allowed";
      },
      count: async (address) => {
        calls.counted.push(address);
      },
    },
    readAsset: async (cid) => {
      calls.read.push(cid);
      return fakes.asset ?? { ok: true, state: "missing" };
    },
    findFile: async (cid) => {
      calls.found.push(cid);
      return fakes.file ?? PDF_FILE;
    },
    deleteFile: async (id): Promise<DeleteFileResult> => {
      calls.deleted.push(id);
      return { ok: true };
    },
    send: async (event) => {
      calls.sent.push(event);
      return fakes.send ? fakes.send() : "event-1";
    },
    maxBytes: 30_000_000,
  };
  return { submitDeps, calls };
}

describe("submitPaper", () => {
  it("sends verisci/paper.submitted with the verified submission, and counts it", async () => {
    const { submitDeps, calls } = deps();

    expect(await submitPaper(INPUT, submitDeps)).toEqual({
      ok: true,
      cid: CID,
      eventId: "event-1",
    });
    expect(calls.verified).toEqual([INPUT]);
    expect(calls.found).toEqual([CID]);
    expect(calls.sent).toEqual([
      {
        id: `paper:${CID}:${SUBMISSION.submitter}`,
        name: PAPER_SUBMITTED,
        data: SUBMISSION,
      },
    ]);
    expect(calls.checked).toEqual([SUBMISSION.submitter]);
    expect(calls.counted).toEqual([SUBMISSION.submitter]);
  });

  it("starts nothing for a paper already published, counting nothing, and gives its UAL", async () => {
    const { submitDeps, calls } = deps({ asset: { ok: true, state: "minted", ual: UAL } });

    expect(await submitPaper(INPUT, submitDeps)).toEqual({ ok: true, cid: CID, ual: UAL });
    expect(calls.read).toEqual([CID]);
    expect(calls.checked).toEqual([]);
    expect(calls.found).toEqual([]);
    expect(calls.sent).toEqual([]);
    expect(calls.counted).toEqual([]);
  });

  it.each<[string, AssetResult]>([
    ["stored but not minted", { ok: true, state: "stored", reservedUal: UAL }],
    ["unreadable", { ok: false, reason: "unreachable" }],
  ])("starts the run as usual when the paper is %s", async (_, asset) => {
    const { submitDeps, calls } = deps({ asset });

    expect(await submitPaper(INPUT, submitDeps)).toEqual({
      ok: true,
      cid: CID,
      eventId: "event-1",
    });
    expect(calls.sent).toHaveLength(1);
  });

  it("sends no time with the event, so Inngest sets it", async () => {
    const { submitDeps, calls } = deps();

    await submitPaper({ ...INPUT, ts: 1 }, submitDeps);

    expect(calls.sent[0]).not.toHaveProperty("ts");
  });

  it.each(["malformed", "bad-cid", "wrong-graph", "expired", "bad-signature"] as const)(
    "refuses a %s submission, sending nothing and counting nothing",
    async (reason) => {
      const { submitDeps, calls } = deps({ verify: { ok: false, reason } });

      expect(await submitPaper(INPUT, submitDeps)).toEqual({ ok: false, reason });
      expect(calls.checked).toEqual([]);
      expect(calls.found).toEqual([]);
      expect(calls.sent).toEqual([]);
      expect(calls.counted).toEqual([]);
    },
  );

  it("refuses a submitter over the limit", async () => {
    const { submitDeps, calls } = deps({ check: "limited" });

    expect(await submitPaper(INPUT, submitDeps)).toEqual({ ok: false, reason: "rate-limited" });
    expect(calls.found).toEqual([]);
    expect(calls.sent).toEqual([]);
  });

  it("refuses a CID with no public file in our account", async () => {
    const { submitDeps, calls } = deps({ file: { ok: false, reason: "missing" } });

    expect(await submitPaper(INPUT, submitDeps)).toEqual({ ok: false, reason: "not-pinned" });
    expect(calls.sent).toEqual([]);
    expect(calls.counted).toEqual([]);
  });

  it.each([
    ["too-large", { id: "file-1", size: 30_000_001, mimeType: "application/pdf" }],
    ["not-a-pdf", { id: "file-1", size: 1000, mimeType: "text/plain" }],
  ] as const)("unpins and refuses a %s file", async (reason, file) => {
    const { submitDeps, calls } = deps({ file: { ok: true, file } });

    expect(await submitPaper(INPUT, submitDeps)).toEqual({ ok: false, reason });
    expect(calls.deleted).toEqual(["file-1"]);
    expect(calls.sent).toEqual([]);
    expect(calls.counted).toEqual([]);
  });

  it.each<[string, Fakes]>([
    ["the chain cannot be asked", { verify: { ok: false, reason: "unreachable" } }],
    ["the limits cannot be read", { check: "unavailable" }],
    ["Pinata cannot be asked", { file: { ok: false, reason: "unavailable" } }],
    ["Inngest refuses the event", { send: () => Promise.reject(new Error("401")) }],
  ])("answers unavailable, counting nothing, when %s", async (_, fakes) => {
    const { submitDeps, calls } = deps(fakes);

    expect(await submitPaper(INPUT, submitDeps)).toEqual({ ok: false, reason: "unavailable" });
    expect(calls.counted).toEqual([]);
  });
});
