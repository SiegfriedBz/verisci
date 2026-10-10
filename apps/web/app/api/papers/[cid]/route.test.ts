// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const CID = "bafybeicrwkcuhyibpnbzadvjw46tl7s5pl5k5rbf4iaega4x3odats642m";
const EVENT_ID = "01K7C2M4X8Q9R1S2T3V4W5Y6Z7";
const readPaper = vi.fn(async () => ({
  asset: { ok: true, state: "draft" } as const,
  run: { ok: true, run: { state: "running" } } as const,
}));

vi.mock("@verisci/agents", () => ({ getUploadService: () => ({ readPaper }) }));

const { GET } = await import("./route.ts");

describe("GET /api/papers/[cid]", () => {
  it("answers the paper's stage as JSON, never cached, reading the run from ?event=", async () => {
    const response = await GET(
      new Request(`http://localhost/api/papers/${CID}?event=${EVENT_ID}`),
      {
        params: Promise.resolve({ cid: CID }),
      },
    );

    expect(await response.json()).toEqual({ stage: "saving" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(readPaper).toHaveBeenCalledWith(CID, EVENT_ID);
  });
});
