// Dev only: requests a phase-1 rating on the RatingController deployed on a local Anvil chain
// (ADR 0036), from a throwaway requester, and sends `labstrail/rating.requested` to the local
// Inngest dev server. On staging and production, the Alchemy Notify webhook sends the event
// instead.
//
//   pnpm --filter @labstrail/workflows rate-paper <target UAL> [--raw] [--no-event]
//
// --no-event requests without sending the event, to start the run another way: `post-webhook`
// with the printed transaction, or the reconciler once the request is old enough.
// Reads LOCAL_CHAIN_RPC_URL and LOCAL_RATING_CONTRACT from the root .env.local (packages/workflows
// README). The UAL is normalized first, as the app does (ADR 0031); --raw sends it as typed, to
// see the oracle cancel an invalid target.
import { ratingControllerAbi } from "@labstrail/contracts";
import { normalizeUal } from "@labstrail/core";
import { createSharedEnv, defineEnv } from "@labstrail/env";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  type Hex,
  http,
  parseEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { inngest } from "../src/inngest.ts";
import { ratingRequestedEvent } from "../src/rating/events.ts";
import { localChainSchema } from "../src/rating-env.ts";

const args = process.argv.slice(2);
const raw = args.includes("--raw");
const noEvent = args.includes("--no-event");
const input = args.find((arg) => !arg.startsWith("--"));
if (!input) {
  console.error(
    "usage: pnpm --filter @labstrail/workflows rate-paper <target UAL> [--raw] [--no-event]",
  );
  process.exit(1);
}

const shared = createSharedEnv();
if (shared.APP_ENV !== "local") {
  console.error(
    "rate-paper runs only with APP_ENV=local, against Anvil and the Inngest dev server",
  );
  process.exit(1);
}
const env = defineEnv({ extends: [shared], server: localChainSchema, runtimeEnv: process.env });
const contract = env.LOCAL_RATING_CONTRACT.toLowerCase() as Hex;
const transport = http(env.LOCAL_CHAIN_RPC_URL);
const client = createPublicClient({ chain: anvil, transport });
if ((await client.getChainId()) !== anvil.id) {
  console.error(`${env.LOCAL_CHAIN_RPC_URL} is not an Anvil chain (chain id ${anvil.id})`);
  process.exit(1);
}

const normalized = normalizeUal(input);
if (!raw && !normalized.ok) {
  console.error(`Not a UAL (${normalized.reason}): ${input}`);
  process.exit(1);
}
const target = raw || !normalized.ok ? input : normalized.ual;

// A throwaway requester per run, so each run starts clear of the cap of pending requests per
// requester, which a stopped local run would otherwise hold (ADR 0015).
const requester = privateKeyToAccount(generatePrivateKey());
await createTestClient({ chain: anvil, mode: "anvil", transport }).setBalance({
  address: requester.address,
  value: parseEther("1"),
});
const hash = await createWalletClient({
  account: requester,
  chain: anvil,
  transport,
}).writeContract({
  address: contract,
  abi: ratingControllerAbi,
  functionName: "requestPhase1",
  args: [target],
});
const receipt = await client.waitForTransactionReceipt({ hash });
const event = receipt.logs.map((log) => ratingRequestedEvent(log)).find((found) => found);
if (!event) {
  console.error(`No Phase1Requested log in ${hash}`);
  process.exit(1);
}
if (!noEvent) await inngest.send(event);

console.log(`Target        ${target}`);
console.log(`Requester     ${requester.address} (throwaway key)`);
console.log(`Request id    ${event.data.requestId}`);
console.log(`Transaction   ${hash}`);
console.log(noEvent ? "Event         not sent (--no-event)" : `Event sent    ${event.id}`);
console.log("Watch the run at http://localhost:8288");
