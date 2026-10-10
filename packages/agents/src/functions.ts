import { createDkgClient } from "@verisci/dkg";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { createAgentsEnv } from "./agents-env.ts";
import { inngest } from "./inngest.ts";
import { createPublishPaper, PUBLISH_SETTINGS, type PublishDeps } from "./publish/publish-paper.ts";
import { readPaper } from "./publish/read-paper.ts";
import { verifySubmission } from "./publish/verify-submission.ts";

/** How long the gateway and GROBID each get, inside the 300 s a step may take on Vercel. */
const IO_TIMEOUT_MS = 60_000;

let publishDeps: PublishDeps | undefined;

/** The publish run's adapters, built from the validated settings on the first run. */
function getPublishDeps(): PublishDeps {
  if (publishDeps) return publishDeps;
  const env = createAgentsEnv();
  const client = createPublicClient({ chain: baseSepolia, transport: http(env.CHAIN_RPC_URL) });
  const paperOptions = {
    gatewayUrl: env.PINATA_GATEWAY_URL,
    grobidUrl: env.GROBID_URL,
    fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
    maxBytes: PUBLISH_SETTINGS.maxPdfBytes,
    timeoutMs: IO_TIMEOUT_MS,
  };
  publishDeps = {
    verifySubmission: (data, receivedAt) =>
      verifySubmission(data, {
        contextGraph: env.DKG_CONTEXT_GRAPH,
        client,
        now: () => receivedAt,
      }),
    readPaper: (cid) => readPaper(cid, paperOptions),
    dkg: createDkgClient({
      url: env.DKG_URL,
      token: env.DKG_TOKEN,
      contextGraphId: env.DKG_CONTEXT_GRAPH,
    }),
  };
  return publishDeps;
}

/** Publishes a submitted PDF as a Target KA (`verisci/paper.submitted`). */
export const publishPaper = createPublishPaper(inngest, getPublishDeps);

/** Every Inngest function, for `web`'s `/api/inngest` route to serve (ADR 0003). */
export const functions = [publishPaper];
