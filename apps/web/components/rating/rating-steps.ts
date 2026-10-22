import type { ChainStep } from "../paper/progress-chain.tsx";

/**
 * The steps a pending rating goes through, in order (ADRs 0011, 0019): the chain's label and
 * detail, the rating page's headline while the step runs, and what happens during it. The
 * rating page and the home page's demo both show them.
 */
export const RATING_STEPS = [
  {
    stage: "scoring",
    label: "Scored",
    detail:
      "Checked against the reporting checklist for its kind of study, each answer backed by a quote",
    headline: "Reading the paper",
    now: "The scoring model reads the paper's text. If the paper is outside the life sciences and health, the rating is cancelled here. Otherwise the model answers the checklist for its kind of study and quotes the passage behind each answer. Code checks every quote against the paper, then computes the score. When the model is busy, it's asked again every few minutes, which can take hours.",
  },
  {
    stage: "saving",
    label: "Saved",
    layer: "off-chain",
    detail: "The rating, with every answer and quote, is written to OriginTrail's knowledge graph",
    headline: "Saving the rating",
    now: "The rating is written to LabsTrail's DKG node as its own Knowledge Asset, linked to the paper, which stays as it was.",
  },
  {
    stage: "minting",
    label: "Minted",
    layer: "on-chain",
    detail:
      "Minted on Base by OriginTrail's Knowledge Asset contracts, as its own asset linked to the paper",
    headline: "Minting the rating",
    now: "LabsTrail's DKG node mints the rating on Base through OriginTrail's Knowledge Asset contracts, the same ones that hold every paper. Once minted, its checks and quotes can't change unnoticed.",
  },
  {
    stage: "recording",
    label: "Recorded",
    layer: "on-chain",
    detail: "The score is stored on LabsTrail's RatingController contract, next to the request",
    headline: "Recording the score",
    now: "LabsTrail's oracle reads the score back from the minted rating and records it on LabsTrail's RatingController contract, next to the request. Once it's recorded, the rating is done and its score shows in the papers list.",
  },
] as const satisfies readonly (ChainStep & { stage: string; headline: string; now: string })[];
