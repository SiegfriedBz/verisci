// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const createUploadUrl = vi.fn(async () => ({
  ok: true,
  url: "https://uploads.pinata.cloud/v3/files/x",
}));
const submitPaper = vi.fn(async () => ({ ok: false, reason: "bad-signature" }));

vi.mock("@verisci/workflows", () => ({
  getUploadService: () => ({ createUploadUrl, submitPaper }),
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
});
