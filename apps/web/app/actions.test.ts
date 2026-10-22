// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const createUploadUrl = vi.fn(async () => ({
  ok: true,
  url: "https://uploads.pinata.cloud/v3/files/x",
}));
const submitPaper = vi.fn(async () => ({ ok: false, reason: "bad-signature" }));

const announceLocalRating = vi.fn(async () => ({ ok: true, requestId: `0x${"ab".repeat(32)}` }));

vi.mock("@labstrail/workflows", () => ({
  getUploadService: () => ({ createUploadUrl, submitPaper }),
  getRatingService: () => ({ announceLocalRating }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));

const actions = await import("./actions.ts");

describe("server actions", () => {
  it("requestUpload signs a URL for the visitor's connection", async () => {
    expect(await actions.requestUpload()).toEqual({
      ok: true,
      url: "https://uploads.pinata.cloud/v3/files/x",
    });
  });

  it("submitPaper hands the submission to the service with the address limiter", async () => {
    const input = { cid: "x" };

    expect(await actions.submitPaper(input)).toEqual({ ok: false, reason: "bad-signature" });
    expect(submitPaper).toHaveBeenCalledWith(
      input,
      expect.objectContaining({ check: expect.any(Function) }),
    );
  });

  it("announceLocalRating hands a transaction hash to the rating service", async () => {
    const hash = `0x${"cd".repeat(32)}`;

    expect(await actions.announceLocalRating(hash)).toEqual({
      ok: true,
      requestId: `0x${"ab".repeat(32)}`,
    });
    expect(announceLocalRating).toHaveBeenCalledWith(hash);
  });

  it("announceLocalRating refuses a string that is not a transaction hash", async () => {
    announceLocalRating.mockClear();

    expect(await actions.announceLocalRating("0x12")).toEqual({ ok: false, reason: "no-request" });
    expect(announceLocalRating).not.toHaveBeenCalled();
  });
});
