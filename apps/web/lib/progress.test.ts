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
const completed = (output: unknown) => ({ ok: true, run: { state: "completed", output } }) as const;

function stage(asset: PaperStatus["asset"], run: PaperStatus["run"]): PaperStage {
  return paperProgress({ asset, run });
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

  it("reads a completed run with an output it does not know as unavailable", () => {
    expect(stage(missing, completed({ state: "odd" }))).toEqual({ stage: "unavailable" });
  });
});

describe("isFinal", () => {
  it.each<[PaperStage, boolean]>([
    [{ stage: "published", ual: UAL }, true],
    [{ stage: "refused", reason: "no-title" }, true],
    [{ stage: "failed" }, true],
    [{ stage: "not-found" }, true],
    [{ stage: "reading" }, false],
    [{ stage: "saving" }, false],
    [{ stage: "minting" }, false],
    [{ stage: "unavailable" }, false],
  ])("%o → %s", (paperStage, final) => {
    expect(isFinal(paperStage)).toBe(final);
  });
});
