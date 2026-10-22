/** Package name, imported by the web app's package test (`apps/web/app/packages.test.ts`). */
export const coreName = "@labstrail/core";

export {
  type AssetNameError,
  type AssetNameResult,
  rKaName,
  targetKaName,
} from "./assets/asset-names.ts";
export { BASE_SEPOLIA_CHAIN_ID } from "./assets/chains.ts";
export { canonicalCid } from "./assets/cid.ts";
export {
  knowledgeAssetToken,
  ORIGINTRAIL_CONTRACTS,
  type OriginTrailContracts,
} from "./assets/origintrail.ts";
export {
  formatUal,
  isSameUal,
  type NormalizeUalResult,
  normalizeUal,
  type ParseUalResult,
  parseUal,
  type Ual,
  type UalError,
} from "./assets/ual.ts";
export {
  type PaperListing,
  paperAuthorsQuery,
  paperCountQuery,
  paperListQuery,
  parsePaperAuthors,
  parsePaperCount,
  parsePaperListing,
  parsePublishedAt,
  publishedPaperQuery,
} from "./papers/paper-list.ts";
export {
  type PaperRecord,
  paperRecordQuery,
  parsePaperRecord,
  type QueryBinding,
} from "./papers/paper-record.ts";
export {
  FIELD_OUTPUT_SCHEMA,
  type FieldCheckInput,
  fieldCheckPrompt,
  parseFieldAnswer,
} from "./publish/field-check.ts";
export {
  canonicalContextGraph,
  MAX_PDF_BYTES,
  SUBMISSION_DOMAIN,
  type SubmissionMessage,
  submissionTypedData,
} from "./publish/submission.ts";
export {
  type PaperSubmission,
  type Triple,
  targetKaQuads,
  VERISCI_NS,
} from "./publish/target-ka.ts";
export { type PaperMetadata, parseTeiHeader, type TeiResult } from "./publish/tei.ts";
export { completeTitle } from "./publish/title.ts";
export {
  CHECKS,
  type Check,
  type CheckId,
  checklistOf,
  STUDY_TYPES,
  type StudyType,
} from "./rating/checklists.ts";
export {
  normalizeForQuote,
  type PaperText,
  type PreparePaperResult,
  preparePaperText,
  type QuoteText,
  quoteFound,
  quoteTextOf,
} from "./rating/paper-text.ts";
export {
  classifyTarget,
  paperHeadOf,
  paperPdfQuery,
  parseRating,
  pdfCidOf,
  type RatingContent,
  type RatingRecord,
  ratingQuery,
  rKaQuads,
  type TargetClass,
  triplesFromBindings,
} from "./rating/rating.ts";
export {
  CHECK_ANSWERS,
  type CheckAnswer,
  type CheckResult,
  checklistScore,
  FIELD_RULE,
  FIELDS,
  type Field,
  parseScorerAnswer,
  SCORER_OUTPUT_SCHEMA,
  SCORER_PROMPT_VERSION,
  type ScorerAnswer,
  type ScorerOutput,
  scoreChecks,
  scorerPrompt,
} from "./rating/scorer.ts";
