import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { SubmitLimiter } from "@verisci/workflows";

/** How much one visitor may ask for, per rolling day (ADR 0035). */
export const UPLOAD_LIMITS = {
  /** Upload URLs per connection (IP): no address is proven before the signature. */
  urlsPerIpPerDay: 10,
  /** Submissions accepted per signing address. */
  submissionsPerAddressPerDay: 5,
} as const;

const DAY_MS = 86_400_000;

/** A rolling window of hits per key: Upstash's `Ratelimit`, or {@link memoryWindow}. */
export interface RateWindow {
  limit(key: string): Promise<{ success: boolean; reason?: string }>;
  getRemaining(key: string): Promise<{ remaining: number }>;
}

/** A {@link SubmitLimiter} that can also check and count in one call. */
export interface Counter extends SubmitLimiter {
  /** Counts one hit if the key is under its limit. */
  take(key: string): Promise<"allowed" | "limited" | "unavailable">;
}

/**
 * Hits kept in this server's memory, for `APP_ENV=local` without Upstash: they reset when
 * the server restarts.
 */
export function memoryWindow(limit: number, windowMs: number, now = Date.now): RateWindow {
  const hits = new Map<string, number[]>();
  const recent = (key: string) => {
    const kept = (hits.get(key) ?? []).filter((time) => time > now() - windowMs);
    hits.set(key, kept);
    return kept;
  };
  return {
    limit: async (key) => {
      const kept = recent(key);
      if (kept.length >= limit) return { success: false };
      kept.push(now());
      return { success: true };
    },
    getRemaining: async (key) => ({ remaining: Math.max(0, limit - recent(key).length) }),
  };
}

/**
 * A limiter over a window. A store that fails or times out reads as `unavailable`
 * (Upstash's `Ratelimit` lets a timed-out call pass, with reason `timeout`); `count` never
 * throws, since the submission it counts has already been sent.
 */
export function counter(window: RateWindow): Counter {
  return {
    check: async (key) => {
      try {
        return (await window.getRemaining(key)).remaining > 0 ? "allowed" : "limited";
      } catch {
        return "unavailable";
      }
    },
    count: async (key) => {
      try {
        await window.limit(key);
      } catch {
        // A lost count only lets one more paper through today.
      }
    },
    take: async (key) => {
      try {
        const hit = await window.limit(key);
        if (hit.reason === "timeout") return "unavailable";
        return hit.success ? "allowed" : "limited";
      } catch {
        return "unavailable";
      }
    },
  };
}

/** Upstash's REST address and token, or none to count in memory. */
export interface UpstashSettings {
  readonly url?: string;
  readonly token?: string;
}

/** The two limits, in Upstash when it is set, else in memory. */
export function createLimits(upstash: UpstashSettings): { urls: Counter; submissions: Counter } {
  if (!upstash.url || !upstash.token) {
    return {
      urls: counter(memoryWindow(UPLOAD_LIMITS.urlsPerIpPerDay, DAY_MS)),
      submissions: counter(memoryWindow(UPLOAD_LIMITS.submissionsPerAddressPerDay, DAY_MS)),
    };
  }
  const redis = new Redis({ url: upstash.url, token: upstash.token });
  const window = (limit: number, prefix: string) =>
    new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, "1 d"), prefix });
  return {
    urls: counter(window(UPLOAD_LIMITS.urlsPerIpPerDay, "verisci:upload-url")),
    submissions: counter(window(UPLOAD_LIMITS.submissionsPerAddressPerDay, "verisci:submission")),
  };
}
