/** Package name, listed on the web app's home page. */
export const dkgName = "@verisci/dkg";

export { createDkgClient, type DkgClient, type DkgClientConfig } from "./client.ts";
export type { AssetResult, AssetState, DkgFailure, MintResult, Quad } from "./types.ts";
