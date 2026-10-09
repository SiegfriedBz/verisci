import { createDkgEnv, type DkgEnv } from "./dkg-env.ts";

export { createDkgEnv, type DkgEnv } from "./dkg-env.ts";

/**
 * The DKG node's settings, validated from `process.env` on first import (ADR 0004). Exported
 * as `@verisci/dkg/env`, apart from the main entry, so importing the client never requires them.
 */
export const env: DkgEnv = createDkgEnv();
