/** Port the DKG daemon's `chain.rpcUrl` points at, on `127.0.0.1`. */
export const DEFAULT_PORT = 8545;

/**
 * Alchemy calls allowed per UTC day. The free tier's monthly compute units cover about
 * 1 million units a day, and a call costs 10 to 75 units, so 20,000 calls stay inside it.
 */
export const DEFAULT_ALCHEMY_DAILY_LIMIT = 20_000;

/** What the proxy reads from its environment. */
export interface ProxyConfig {
  /** Alchemy's Base Sepolia URL, key included. */
  readonly upstreamRpc: string;
  readonly port: number;
  readonly alchemyDailyLimit: number;
}

/** The result of {@link readConfig}: the settings, or every problem found. */
export type ConfigResult =
  | { readonly ok: true; readonly config: ProxyConfig }
  | { readonly ok: false; readonly errors: readonly string[] };

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

/**
 * Reads `UPSTREAM_RPC`, `PORT` and `ALCHEMY_DAILY_LIMIT`. The proxy runs on the DKG node
 * server with plain Node, so it reads its settings itself (ADR 0004). Error messages name
 * the setting and never repeat its value, since `UPSTREAM_RPC` holds a key.
 */
export function readConfig(env: Readonly<Record<string, string | undefined>>): ConfigResult {
  const errors: string[] = [];

  const upstreamRpc = env.UPSTREAM_RPC ?? "";
  if (!isHttpsUrl(upstreamRpc)) errors.push("UPSTREAM_RPC must be an https URL (Alchemy's)");

  const port = env.PORT === undefined ? DEFAULT_PORT : positiveInteger(env.PORT);
  if (port === undefined || port > 65_535)
    errors.push("PORT must be a whole number from 1 to 65535");

  const alchemyDailyLimit =
    env.ALCHEMY_DAILY_LIMIT === undefined
      ? DEFAULT_ALCHEMY_DAILY_LIMIT
      : positiveInteger(env.ALCHEMY_DAILY_LIMIT);
  if (alchemyDailyLimit === undefined)
    errors.push("ALCHEMY_DAILY_LIMIT must be a whole number above 0");

  if (errors.length > 0 || port === undefined || alchemyDailyLimit === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, config: { upstreamRpc, port, alchemyDailyLimit } };
}

function positiveInteger(value: string): number | undefined {
  return POSITIVE_INTEGER.test(value) ? Number(value) : undefined;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
