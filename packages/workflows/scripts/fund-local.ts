// Dev only: gives a wallet 1 ETH on the local Anvil chain (ADR 0036), so it can request a
// rating from the paper page with `APP_ENV=local`.
//
//   pnpm --filter @labstrail/workflows fund-local <address>
//
// Reads LOCAL_CHAIN_RPC_URL from the root .env.local (packages/workflows README).
import { createSharedEnv, defineEnv } from "@labstrail/env";
import { createPublicClient, createTestClient, http } from "viem";
import { anvil } from "viem/chains";
import { localChainSchema } from "../src/rating-env.ts";
import { fundOnAnvil } from "./fund.ts";

const [input] = process.argv.slice(2);
if (!input) {
  console.error("usage: pnpm --filter @labstrail/workflows fund-local <address>");
  process.exit(1);
}

const env = defineEnv({
  extends: [createSharedEnv()],
  server: { LOCAL_CHAIN_RPC_URL: localChainSchema.LOCAL_CHAIN_RPC_URL },
  runtimeEnv: process.env,
});
const transport = http(env.LOCAL_CHAIN_RPC_URL);
const client = createPublicClient({ chain: anvil, transport });
const test = createTestClient({ chain: anvil, mode: "anvil", transport });

const funded = await fundOnAnvil(input, {
  getChainId: () => client.getChainId(),
  setBalance: (args) => test.setBalance(args),
});
if (!funded.ok) {
  console.error(funded.message);
  process.exit(1);
}
console.log(`${funded.address} now holds 1 ETH on ${env.LOCAL_CHAIN_RPC_URL}`);
