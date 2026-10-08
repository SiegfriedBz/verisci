import { describe, expect, it } from "vitest";
import { DEFAULT_ALCHEMY_DAILY_LIMIT, DEFAULT_PORT, readConfig } from "./config.ts";

const UPSTREAM = "https://base-sepolia.g.alchemy.com/v2/key";

describe("readConfig", () => {
  it("applies the default port and daily Alchemy limit", () => {
    expect(readConfig({ UPSTREAM_RPC: UPSTREAM })).toEqual({
      ok: true,
      config: {
        upstreamRpc: UPSTREAM,
        port: DEFAULT_PORT,
        alchemyDailyLimit: DEFAULT_ALCHEMY_DAILY_LIMIT,
      },
    });
  });

  it("reads a port and a daily limit", () => {
    expect(
      readConfig({ UPSTREAM_RPC: UPSTREAM, PORT: "9545", ALCHEMY_DAILY_LIMIT: "5000" }),
    ).toEqual({
      ok: true,
      config: { upstreamRpc: UPSTREAM, port: 9545, alchemyDailyLimit: 5000 },
    });
  });

  it("names every bad setting at once", () => {
    const result = readConfig({ PORT: "99999", ALCHEMY_DAILY_LIMIT: "-1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(3);
    expect(result.errors.join("\n")).toMatch(/UPSTREAM_RPC/);
    expect(result.errors.join("\n")).toMatch(/PORT/);
    expect(result.errors.join("\n")).toMatch(/ALCHEMY_DAILY_LIMIT/);
  });

  it.each([
    ["not a URL", "alchemy"],
    ["plain http", "http://example.com"],
  ])("refuses an UPSTREAM_RPC that is %s", (_, value) => {
    expect(readConfig({ UPSTREAM_RPC: value }).ok).toBe(false);
  });

  it.each(["0", "1.5", "abc", ""])("refuses ALCHEMY_DAILY_LIMIT=%j", (value) => {
    expect(readConfig({ UPSTREAM_RPC: UPSTREAM, ALCHEMY_DAILY_LIMIT: value }).ok).toBe(false);
  });

  it("keeps the Alchemy URL out of its error messages", () => {
    const result = readConfig({ UPSTREAM_RPC: "http://secret-key.example", PORT: "x" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).not.toMatch(/secret-key/);
  });
});
