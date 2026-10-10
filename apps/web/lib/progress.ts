import type { PaperStatus, PublishOutcome } from "@verisci/agents";
import { z } from "zod";

/** Why a run refused a paper, as its outcome says. */
export type RefusalReason = Extract<PublishOutcome, { state: "refused" }>["reason"];

/**
 * Where a paper stands, as its page shows it: on the way (`reading`, `saving`, `minting`),
 * done (`published`, `refused`, `failed`, `not-found`), or not readable now (`unavailable`,
 * asked again on the next poll).
 */
export type PaperStage =
  | { readonly stage: "reading" | "saving" | "minting" }
  | { readonly stage: "published"; readonly ual: string }
  | { readonly stage: "refused"; readonly reason: RefusalReason }
  | { readonly stage: "failed" | "not-found" | "unavailable" };

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
export function paperProgress({ asset, run }: PaperStatus): PaperStage {
  if (asset.ok && asset.state === "minted") return { stage: "published", ual: asset.ual };
  if (!asset.ok || run?.ok === false) return { stage: "unavailable" };
  const state = run?.run;
  if (state?.state === "failed") return { stage: "failed" };
  if (state?.state === "completed") {
    const parsed = outcome.safeParse(state.output);
    if (!parsed.success) return { stage: "unavailable" };
    return parsed.data.state === "minted"
      ? { stage: "published", ual: parsed.data.ual }
      : { stage: "refused", reason: parsed.data.reason as RefusalReason };
  }
  if (asset.state === "stored") return { stage: "minting" };
  if (asset.state === "draft") return { stage: "saving" };
  return run === undefined ? { stage: "not-found" } : { stage: "reading" };
}

/** Whether the page stops polling at this stage. */
export function isFinal(paperStage: PaperStage): boolean {
  return ["published", "refused", "failed", "not-found"].includes(paperStage.stage);
}
