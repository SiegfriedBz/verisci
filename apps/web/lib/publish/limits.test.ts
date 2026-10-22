import { afterEach, describe, expect, it, vi } from "vitest";
import { counter, createLimits, memoryWindow, type RateWindow, UPLOAD_LIMITS } from "./limits.ts";

const DAY_MS = 86_400_000;

describe("memoryWindow", () => {
  it("allows `limit` hits per window, then refuses until the oldest leaves it", async () => {
    let now = 0;
    const window = memoryWindow(2, DAY_MS, () => now);

    expect((await window.limit("a")).success).toBe(true);
    now = 1000;
    expect((await window.limit("a")).success).toBe(true);
    expect((await window.limit("a")).success).toBe(false);
    expect((await window.getRemaining("a")).remaining).toBe(0);
    expect((await window.limit("b")).success).toBe(true);

    now = DAY_MS + 1;
    expect((await window.getRemaining("a")).remaining).toBe(1);
    expect((await window.limit("a")).success).toBe(true);
  });
});

describe("counter", () => {
  it("checks without counting, and counts on demand", async () => {
    const limiter = counter(memoryWindow(1, DAY_MS, () => 0));

    expect(await limiter.check("a")).toBe("allowed");
    expect(await limiter.check("a")).toBe("allowed");
    await limiter.count("a");
    expect(await limiter.check("a")).toBe("limited");
  });

  it("takes one hit at once with take", async () => {
    const limiter = counter(memoryWindow(1, DAY_MS, () => 0));

    expect(await limiter.take("a")).toBe("allowed");
    expect(await limiter.take("a")).toBe("limited");
  });

  it("reads a store that fails or times out as unavailable, with why, and never throws on count", async () => {
    const down = new Error("redis down at https://eu1-x.upstash.io");
    const broken: RateWindow = {
      limit: () => Promise.reject(down),
      getRemaining: () => Promise.reject(down),
    };
    const timingOut: RateWindow = {
      limit: async () => ({ success: true, reason: "timeout" }),
      getRemaining: async () => ({ remaining: 1 }),
    };

    expect(await counter(broken).check("a")).toEqual({ unavailable: "redis down at <url>" });
    expect(await counter(broken).take("a")).toEqual({ unavailable: "redis down at <url>" });
    await expect(counter(broken).count("a")).resolves.toBeUndefined();
    expect(await counter(timingOut).take("a")).toEqual({ unavailable: "timeout" });
  });
  it("never logs the command Upstash echoes, which holds the visitor's IP", async () => {
    const refused = new Error(
      'WRONGPASS invalid password, command was: ["evalsha","abc",["labstrail:upload-url:203.0.113.7"]]',
    );
    const broken: RateWindow = {
      limit: () => Promise.reject(refused),
      getRemaining: () => Promise.reject(refused),
    };

    expect(await counter(broken).take("203.0.113.7")).toEqual({
      unavailable: "WRONGPASS invalid password",
    });
    expect(await counter(broken).check("203.0.113.7")).toEqual({
      unavailable: "WRONGPASS invalid password",
    });
  });
});

describe("createLimits", () => {
  it("counts in memory without Upstash: 10 upload URLs and 5 submissions a day", async () => {
    const { urls, submissions } = createLimits({}, "local");

    for (let i = 0; i < UPLOAD_LIMITS.urlsPerIpPerDay; i++)
      expect(await urls.take("ip")).toBe("allowed");
    expect(await urls.take("ip")).toBe("limited");
    for (let i = 0; i < UPLOAD_LIMITS.submissionsPerAddressPerDay; i++)
      await submissions.count("0xa");
    expect(await submissions.check("0xa")).toBe("limited");
  });

  it("builds Upstash limiters when Upstash is set, without calling it", () => {
    const limits = createLimits({ url: "https://example.upstash.io", token: "secret" }, "staging");

    expect(Object.keys(limits)).toEqual(["urls", "submissions"]);
  });

  describe("one Upstash database shared by the environments", () => {
    afterEach(() => vi.unstubAllGlobals());

    /** The keys of every command the limits send to Upstash while `use` runs. */
    async function keysSent(
      appEnv: "staging" | "production",
      use: (limits: ReturnType<typeof createLimits>) => Promise<unknown>,
    ) {
      const bodies: string[] = [];
      vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ""));
        return new Response(JSON.stringify({ result: [1, 1] }), { status: 200 });
      });
      await use(createLimits({ url: "https://example.upstash.io", token: "secret" }, appEnv));
      return bodies.join("\n");
    }

    it.each(["staging", "production"] as const)("names %s's counters after it", async (appEnv) => {
      const sent = await keysSent(appEnv, async ({ urls, submissions }) => {
        await urls.take("203.0.113.7");
        await submissions.count("0xa");
      });

      expect(sent).toContain(`labstrail:${appEnv}:upload-url`);
      expect(sent).toContain(`labstrail:${appEnv}:submission`);
    });

    it("leaves production's counters alone when staging counts a hit", async () => {
      const sent = await keysSent("staging", async ({ urls }) => urls.take("203.0.113.7"));

      expect(sent).not.toContain("labstrail:production:");
    });
  });
});
