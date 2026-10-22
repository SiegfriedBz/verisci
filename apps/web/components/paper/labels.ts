/*
 * The paper page's panel headings and field labels, shared with its skeleton so the skeleton
 * shows the real ones and only the values load. A plain module: strings exported from a
 * "use client" file would reach server components as client references, not text.
 */

/** The published paper's panel (`VerifyPanel`): its heading. */
export const VERIFY_TITLE = "Verify it yourself";
/** The line under `VERIFY_TITLE`. */
export const VERIFY_INTRO = "These values are public. You can check each one without trusting us.";

/**
 * `VerifyPanel`'s two groups: what the submitter signed (submitter to context graph), then
 * where the asset lives (publisher to PDF).
 */
export const VERIFY_GROUPS = {
  submission: "The submission",
  asset: "The asset",
} as const;

/** `VerifyPanel`'s fields, in the order it shows them. */
export const VERIFY_LABELS = {
  submitter: "Submitted by",
  signature: "Submitter's signature",
  deadline: "Signed deadline (Unix seconds)",
  contextGraph: "Context graph",
  publisher: "Minted to LabsTrail's node",
  token: "Asset token (ERC-721, OriginTrail's DKGKnowledgeAssets)",
  ual: "Knowledge Asset (UAL)",
  pdf: "PDF (CID)",
} as const;

/** The panel beside a paper being published (`PaperProgress`): its heading. */
export const PUBLISH_PANEL_TITLE = "What's happening now";
/** That panel's fields, in the order it shows them; the UAL shows once the paper is minted. */
export const PUBLISH_PANEL_LABELS = {
  ual: VERIFY_LABELS.ual,
  pdf: VERIFY_LABELS.pdf,
  ipfs: "IPFS link",
} as const;
