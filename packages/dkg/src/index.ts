/** Package name, imported by the web app's package test (`apps/web/app/packages.test.ts`). */
export const dkgName = "@labstrail/dkg";

export { createDkgClient, type DkgClient, type DkgClientConfig } from "./client.ts";
export { contextGraphSchema, createDkgEnv, type DkgEnv, dkgSchema } from "./dkg-env.ts";
export type {
  AssetResult,
  AssetState,
  DkgFailure,
  GraphStatus,
  MintResult,
  NodeStatus,
  Quad,
  QueryResult,
} from "./types.ts";
