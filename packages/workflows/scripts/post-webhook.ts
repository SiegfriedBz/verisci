// Dev only: posts the logs of a transaction on the local Anvil chain to the webhook route, as
// an Alchemy Notify delivery signed with ALCHEMY_WEBHOOK_SIGNING_KEY (ADR 0017), to check the
// route by hand. Alchemy Notify watches only real chains, so this stands in for it locally.
//
//   pnpm --filter @labstrail/workflows post-webhook <tx hash> [--url <route>]
//
// Reads LOCAL_CHAIN_RPC_URL and ALCHEMY_WEBHOOK_SIGNING_KEY from the root .env.local; the route
// needs the same key (packages/workflows README). Request without an event first
// (`rate-paper <UAL> --no-event`), or Inngest drops this one as a repeat for 24 hours.
import { createHmac } from "node:crypto";
import { createSharedEnv, defineEnv } from "@labstrail/env";
import { createPublicClient, type Hex, http } from "viem";
import { anvil } from "viem/chains";
import { z } from "zod";
import { localChainSchema } from "../src/rating-env.ts";

const args = process.argv.slice(2);
const hash = args.find((arg) => /^0x[0-9a-fA-F]{64}$/.test(arg));
const urlAt = args.indexOf("--url");
const url = urlAt >= 0 ? args[urlAt + 1] : "http://localhost:3000/api/webhooks/alchemy";
if (!hash || !url) {
  console.error("usage: pnpm --filter @labstrail/workflows post-webhook <tx hash> [--url <route>]");
  process.exit(1);
}

const shared = createSharedEnv();
if (shared.APP_ENV !== "local") {
  console.error("post-webhook runs only with APP_ENV=local, against Anvil and a local server");
  process.exit(1);
}
const env = defineEnv({
  extends: [shared],
  server: {
    LOCAL_CHAIN_RPC_URL: localChainSchema.LOCAL_CHAIN_RPC_URL,
    ALCHEMY_WEBHOOK_SIGNING_KEY: z.string().min(1),
  },
  runtimeEnv: process.env,
});
const client = createPublicClient({ chain: anvil, transport: http(env.LOCAL_CHAIN_RPC_URL) });
const receipt = await client.getTransactionReceipt({ hash: hash as Hex });

// The fields the registered GraphQL query asks for, for every log of the transaction, as the
// query takes every event of the contract (packages/workflows README).
const body = JSON.stringify({
  webhookId: "wh_local",
  id: `whevt_local_${Date.now()}`,
  createdAt: new Date().toISOString(),
  type: "GRAPHQL",
  event: {
    data: {
      block: {
        logs: receipt.logs.map((log) => ({
          data: log.data,
          topics: log.topics,
          account: { address: log.address },
        })),
      },
    },
    sequenceNumber: String(Date.now()),
  },
});
const signature = createHmac("sha256", env.ALCHEMY_WEBHOOK_SIGNING_KEY)
  .update(body, "utf8")
  .digest("hex");
const response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "x-alchemy-signature": signature },
  body,
});

console.log(`Posted        ${receipt.logs.length} log(s) of ${hash}`);
console.log(`Route         ${url}`);
console.log(`Answer        ${response.status}`);
console.log("Watch the run at http://localhost:8288");
