// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const REQUEST_ID = `0x${"ab".repeat(32)}`;
const readRating = vi.fn(async () => ({
  ok: true,
  rating: { requestId: REQUEST_ID, status: "pending" },
  stage: "minting",
}));

vi.mock("@labstrail/workflows", () => ({ getRatingService: () => ({ readRating }) }));
let env: Record<string, string | undefined> = { APP_ENV: "staging" };
vi.mock("../../../../lib/web-env.ts", () => ({ createWebEnv: () => env }));

const { GET } = await import("./route.ts");

describe("GET /api/ratings/[requestId]", () => {
  it("answers the rating's view as JSON, never cached", async () => {
    const response = await GET(new Request(`http://localhost/api/ratings/${REQUEST_ID}`), {
      params: Promise.resolve({ requestId: REQUEST_ID }),
    });

    expect(await response.json()).toEqual({
      ok: true,
      rating: { requestId: REQUEST_ID, status: "pending" },
      stage: "minting",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(readRating).toHaveBeenCalledWith(REQUEST_ID);
  });

  it("answers not-found for an id that is not a request id, reading nothing", async () => {
    readRating.mockClear();

    const response = await GET(new Request("http://localhost/api/ratings/7"), {
      params: Promise.resolve({ requestId: "7" }),
    });

    expect(await response.json()).toEqual({ ok: false, reason: "not-found" });
    expect(readRating).not.toHaveBeenCalled();
  });

  it("answers not-found, reading nothing, where no contract takes ratings", async () => {
    readRating.mockClear();
    env = { APP_ENV: "local" };

    const response = await GET(new Request(`http://localhost/api/ratings/${REQUEST_ID}`), {
      params: Promise.resolve({ requestId: REQUEST_ID }),
    });

    expect(await response.json()).toEqual({ ok: false, reason: "not-found" });
    expect(readRating).not.toHaveBeenCalled();
    env = { APP_ENV: "staging" };
  });
});
