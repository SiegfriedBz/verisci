/** Package name, listed on the web app's home page. */
export const coreName = "@verisci/core";

export {
  type AssetNameError,
  type AssetNameResult,
  rKaName,
  targetKaName,
} from "./asset-names.ts";
export { BASE_SEPOLIA_CHAIN_ID } from "./chains.ts";
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
