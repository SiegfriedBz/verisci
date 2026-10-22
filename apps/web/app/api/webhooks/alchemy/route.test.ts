// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const receive = vi.fn<(rawBody: string, signature: string | null) => Promise<number>>();
vi.mock("@labstrail/workflows", () => ({ getWebhookIntake: () => ({ receive }) }));

const { POST } = await import("./route.ts");

describe("POST /api/webhooks/alchemy", () => {
  afterEach(() => receive.mockReset());

  it("hands the intake the raw body and the signature, and answers its status", async () => {
    receive.mockResolvedValue(200);
    const raw = '{"type": "GRAPHQL",  "event": {}}';

    const response = await POST(
      new Request("http://localhost/api/webhooks/alchemy", {
        method: "POST",
        headers: { "x-alchemy-signature": "ab12" },
        body: raw,
      }),
    );

    expect(receive).toHaveBeenCalledWith(raw, "ab12");
    expect(response.status).toBe(200);
  });

  it.each([401, 404, 503])("answers %i when the intake does", async (status) => {
    receive.mockResolvedValue(status);

    const response = await POST(
      new Request("http://localhost/api/webhooks/alchemy", { method: "POST", body: "{}" }),
    );

    expect(receive).toHaveBeenCalledWith("{}", null);
    expect(response.status).toBe(status);
    expect(await response.text()).toBe("");
  });
});
