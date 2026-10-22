import { readOracleAgent, readRatingRequest } from "@labstrail/contracts";
import {
  type Account,
  BaseError,
  ExecutionRevertedError,
  type Hex,
  InsufficientFundsError,
  NonceTooLowError,
  type PublicClient,
  TransactionReceiptNotFoundError,
  type WalletClient,
} from "viem";
import type { OracleChain, SendResult } from "./oracle.ts";

/** What the oracle's chain needs: a public client, and a wallet client holding the oracle's key. */
export interface OracleChainClients {
  readonly client: PublicClient;
  readonly wallet: WalletClient;
  readonly account: Account;
}

/** Messages a node gives for a nonce some transaction already holds. viem names only some. */
const IN_FLIGHT = /underpriced|already known|nonce too low|replacement transaction/i;

/**
 * Why a send was refused: `in-flight` when a transaction holds the nonce (nonce too low,
 * already known, replacement underpriced), `no-funds`, `reverted` when the call would revert,
 * else `unreachable`.
 */
export function sendFailure(error: unknown): Exclude<SendResult, { ok: true }>["reason"] {
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof NonceTooLowError)) return "in-flight";
    if (error.walk((cause) => cause instanceof InsufficientFundsError)) return "no-funds";
    if (error.walk((cause) => cause instanceof ExecutionRevertedError)) return "reverted";
  }
  const message = error instanceof Error ? error.message : String(error);
  return IN_FLIGHT.test(message) ? "in-flight" : "unreachable";
}

/**
 * The oracle function's chain over viem: reads go through `client`, sends are signed by
 * `account` through `wallet`. Every call returns a result and never throws; the clients'
 * transports carry the RPC timeout (`ORACLE_SETTINGS.rpcTimeoutMs`).
 */
export function createOracleChain({ client, wallet, account }: OracleChainClients): OracleChain {
  return {
    account: account.address.toLowerCase(),
    now: () => Date.now(),
    async nonces() {
      try {
        const [latest, pending] = await Promise.all([
          client.getTransactionCount({ address: account.address, blockTag: "latest" }),
          client.getTransactionCount({ address: account.address, blockTag: "pending" }),
        ]);
        return { ok: true, latest, pending };
      } catch {
        return { ok: false };
      }
    },
    readRequest: (contract, requestId) => readRatingRequest(client, contract, requestId),
    readOracle: (contract) => readOracleAgent(client, contract),
    async estimateFees() {
      try {
        const { maxFeePerGas, maxPriorityFeePerGas } = await client.estimateFeesPerGas();
        return { ok: true, fees: { maxFeePerGas, maxPriorityFeePerGas } };
      } catch {
        return { ok: false };
      }
    },
    async send({ to, data, nonce, fees }) {
      try {
        const hash = await wallet.sendTransaction({
          account,
          chain: wallet.chain,
          to: to as Hex,
          data,
          nonce,
          value: 0n,
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        });
        return { ok: true, hash };
      } catch (error) {
        return { ok: false, reason: sendFailure(error) };
      }
    },
    async receipt(hash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        return { ok: true, state: receipt.status === "success" ? "success" : "reverted" };
      } catch (error) {
        return error instanceof TransactionReceiptNotFoundError
          ? { ok: true, state: "none" }
          : { ok: false };
      }
    },
  };
}
