import { sharedEnv } from "@verisci/env";
import { Inngest } from "inngest";

/**
 * verisci's Inngest client: in dev mode, talking to the local dev server, when `APP_ENV` is
 * `local`; otherwise to Inngest Cloud, with the event and signing keys the SDK reads itself,
 * and the branch environment it picks from `VERCEL_GIT_COMMIT_REF` (`docs/domain.md` →
 * Inngest and Vercel).
 */
export const inngest = new Inngest({ id: "verisci", isDev: sharedEnv.APP_ENV === "local" });
