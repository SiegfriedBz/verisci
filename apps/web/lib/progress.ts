import type { PaperStatus, PublishOutcome } from "@verisci/agents";
import { z } from "zod";

/** Why a run refused a paper, as its outcome says. */
export type RefusalReason = Extract<PublishOutcome, { state: "refused" }>["reason"];

/**
 * Where a paper stands, as its page shows it: on the way (`reading`, `saving`, `minting`),
 * done (`published`, `refused`, `failed`, `not-found`, `not-published`), or not readable now
 * (`unavailable`, asked again on the next poll). `not-published` is a run that ended over a
 * minute ago with an output that cannot be read, as the local dev server answers, and
 * nothing stored.
 */
export type PaperStage =
  | { readonly stage: "reading" | "saving" | "minting" }
  | { readonly stage: "published"; readonly ual: string }
  | { readonly stage: "refused"; readonly reason: RefusalReason }
  | { readonly stage: "failed" | "not-found" | "not-published" | "unavailable" };

/**
 * How long after a run ends a missing asset still reads as `reading`: the node can briefly
 * not report a paper the run has just minted.
 */
const SETTLE_MS = 60_000;

const outcome = z.union([
  z.object({ state: z.literal("minted"), ual: z.string() }),
  z.object({ state: z.literal("refused"), reason: z.string() }),
]);

/**
 * One stage from what the DKG and the run say. A minted asset is published whatever the
 * run says, so a second submitter of the same PDF sees it at once (ADR 0010). A failed run
 * means submitting the same PDF again. With no run to ask about, a missing asset is
 * `not-found`.
 */
export function paperProgress({ asset, run }: PaperStatus, now = Date.now()): PaperStage {
  if (asset.ok && asset.state === "minted") return { stage: "published", ual: asset.ual };
  if (!asset.ok || run?.ok === false) return { stage: "unavailable" };
  const state = run?.run;
  if (state?.state === "failed") return { stage: "failed" };
  if (state?.state === "completed") {
    const parsed = outcome.safeParse(state.output);
    if (parsed.success) {
      return parsed.data.state === "minted"
        ? { stage: "published", ual: parsed.data.ual }
        : { stage: "refused", reason: parsed.data.reason as RefusalReason };
    }
    const settled = state.endedAt !== undefined && now - state.endedAt > SETTLE_MS;
    if (asset.state === "missing" && settled) return { stage: "not-published" };
  }
  if (asset.state === "stored") return { stage: "minting" };
  if (asset.state === "draft") return { stage: "saving" };
  return run === undefined ? { stage: "not-found" } : { stage: "reading" };
}

/** Whether the page stops polling at this stage. */
export function isFinal(paperStage: PaperStage): boolean {
  return ["published", "refused", "failed", "not-found", "not-published"].includes(
    paperStage.stage,
  );
}
