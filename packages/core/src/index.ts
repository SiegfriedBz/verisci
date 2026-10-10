/** Package name, imported by the web app's package test (`apps/web/app/packages.test.ts`). */
export const coreName = "@verisci/core";

export {
  type AssetNameError,
  type AssetNameResult,
  rKaName,
  targetKaName,
} from "./asset-names.ts";
export { BASE_SEPOLIA_CHAIN_ID } from "./chains.ts";
export { canonicalCid } from "./cid.ts";
export {
  knowledgeAssetToken,
  ORIGINTRAIL_CONTRACTS,
  type OriginTrailContracts,
} from "./origintrail.ts";
export {
  type PaperRecord,
  paperRecordQuery,
  parsePaperRecord,
  type QueryBinding,
} from "./paper-record.ts";
export {
  canonicalContextGraph,
  SUBMISSION_DOMAIN,
  type SubmissionMessage,
  submissionTypedData,
} from "./submission.ts";
export { type PaperSubmission, type Triple, targetKaQuads, VERISCI_NS } from "./target-ka.ts";
export { type PaperMetadata, parseTeiHeader, type TeiResult } from "./tei.ts";
export {
  formatUal,
  isSameUal,
  type NormalizeUalResult,
  normalizeUal,
  type ParseUalResult,
  parseUal,
  type Ual,
  type UalError,
} from "./ual.ts";
