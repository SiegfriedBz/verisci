import type { PaperStatus } from "@verisci/agents";
import { describe, expect, it } from "vitest";
import { isFinal, type PaperStage, paperProgress } from "./progress.ts";

const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/5";

const minted = { ok: true, state: "minted", ual: UAL } as const;
const stored = { ok: true, state: "stored", reservedUal: UAL } as const;
const draft = { ok: true, state: "draft" } as const;
const missing = { ok: true, state: "missing" } as const;
const nodeDown = { ok: false, reason: "unreachable" } as const;

const running = { ok: true, run: { state: "running" } } as const;
const notStarted = { ok: true, run: undefined } as const;
const failed = { ok: true, run: { state: "failed" } } as const;
const inngestDown = { ok: false, reason: "unavailable" } as const;
const NOW = 1_800_000_000_000;
const completed = (output: unknown, endedAt: number | undefined = NOW - 120_000) =>
  ({ ok: true, run: { state: "completed", output, endedAt } }) as const;

function stage(asset: PaperStatus["asset"], run: PaperStatus["run"]): PaperStage {
  return paperProgress({ asset, run }, NOW);
}

describe("paperProgress", () => {
  it("reads a minted asset as published, whatever the run says", () => {
    expect(stage(minted, running)).toEqual({ stage: "published", ual: UAL });
    expect(stage(minted, failed)).toEqual({ stage: "published", ual: UAL });
    expect(stage(minted, undefined)).toEqual({ stage: "published", ual: UAL });
  });

  it("reads a run that minted as published before the node shows it", () => {
    expect(stage(stored, completed({ state: "minted", ual: UAL }))).toEqual({
      stage: "published",
      ual: UAL,
    });
  });

  it("reads a stored asset as minting, and a draft as saving", () => {
    expect(stage(stored, running)).toEqual({ stage: "minting" });
    expect(stage(draft, running)).toEqual({ stage: "saving" });
  });

  it("reads a missing asset with a queued or running run as reading", () => {
    expect(stage(missing, running)).toEqual({ stage: "reading" });
    expect(stage(missing, notStarted)).toEqual({ stage: "reading" });
  });

  it("reads a run that refused the paper as refused, with why", () => {
    expect(stage(missing, completed({ state: "refused", reason: "no-title" }))).toEqual({
      stage: "refused",
      reason: "no-title",
    });
  });

  it("reads a failed or cancelled run as failed", () => {
    expect(stage(missing, failed)).toEqual({ stage: "failed" });
    expect(stage(stored, failed)).toEqual({ stage: "failed" });
  });

  it("reads a missing asset with no run to ask about as not-found", () => {
    expect(stage(missing, undefined)).toEqual({ stage: "not-found" });
  });

  it("reads a node or Inngest that does not answer as unavailable", () => {
    expect(stage(nodeDown, running)).toEqual({ stage: "unavailable" });
    expect(stage(missing, inngestDown)).toEqual({ stage: "unavailable" });
  });

  it("reads a completed run whose output it cannot read, with nothing stored, as not-published", () => {
    // The local dev server answers an empty output (inngest-cli 1.46.0).
    expect(stage(missing, completed(""))).toEqual({ stage: "not-published" });
    expect(stage(missing, completed({ state: "odd" }))).toEqual({ stage: "not-published" });
  });

  it("keeps reading for a minute after such a run ends, while the node catches up", () => {
    expect(stage(missing, completed("", NOW - 30_000))).toEqual({ stage: "reading" });
    const noEnd = {
      ok: true,
      run: { state: "completed", output: "", endedAt: undefined },
    } as const;
    expect(stage(missing, noEnd)).toEqual({ stage: "reading" });
  });

  it("follows the asset when a completed run's output cannot be read but something is stored", () => {
    expect(stage(stored, completed(""))).toEqual({ stage: "minting" });
  });
});

describe("isFinal", () => {
  it.each<[PaperStage, boolean]>([
    [{ stage: "published", ual: UAL }, true],
    [{ stage: "refused", reason: "no-title" }, true],
    [{ stage: "failed" }, true],
    [{ stage: "not-found" }, true],
    [{ stage: "not-published" }, true],
    [{ stage: "reading" }, false],
    [{ stage: "saving" }, false],
    [{ stage: "minting" }, false],
    [{ stage: "unavailable" }, false],
  ])("%o → %s", (paperStage, final) => {
    expect(isFinal(paperStage)).toBe(final);
  });
});
