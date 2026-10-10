/** Package name, listed on the web app's home page. */
export const dkgName = "@verisci/dkg";

export { createDkgClient, type DkgClient, type DkgClientConfig } from "./client.ts";
export { contextGraphSchema, createDkgEnv, type DkgEnv, dkgSchema } from "./dkg-env.ts";
export type {
  AssetResult,
  AssetState,
  DkgFailure,
  MintResult,
  Quad,
  QueryResult,
} from "./types.ts";
