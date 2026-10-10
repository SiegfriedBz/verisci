import { describe, expect, it } from "vitest";
import { readRun } from "./runs.ts";

const EVENT_ID = "01K7C2M4X8Q9R1S2T3V4W5Y6Z7";
const OUTPUT = {
  state: "minted",
  ual: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/5",
};

function fakeFetch(response: () => Response | Promise<Response>) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return response();
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

function run(status: string, output: unknown = null) {
  return { run_id: "run-1", event_id: "event-1", function_id: "f", status, output };
}

const cloud = {
  apiUrl: "https://api.inngest.com/",
  signingKey: "signkey-test-0123",
  timeoutMs: 1000,
};

describe("readRun", () => {
  it("asks for the event's runs with the signing key and the branch environment", async () => {
    const { fetch, requests } = fakeFetch(() => Response.json({ data: [run("Running")] }));

    await readRun(EVENT_ID, { ...cloud, branch: "develop", fetch });

    expect(requests[0]?.url).toBe(`https://api.inngest.com/v1/events/${EVENT_ID}/runs`);
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer signkey-test-0123");
    expect(headers.get("x-inngest-env")).toBe("develop");
  });

  it("sends no branch header for production, and no key to the dev server", async () => {
    const { fetch, requests } = fakeFetch(() => Response.json({ data: [] }));

    await readRun(EVENT_ID, { ...cloud, fetch });
    await readRun(EVENT_ID, { apiUrl: "http://127.0.0.1:8288", timeoutMs: 1000, fetch });

    expect(new Headers(requests[0]?.init?.headers).has("x-inngest-env")).toBe(false);
    expect(new Headers(requests[1]?.init?.headers).has("authorization")).toBe(false);
    expect(requests[1]?.url).toBe(`http://127.0.0.1:8288/v1/events/${EVENT_ID}/runs`);
  });

  it.each([
    ["Running", { state: "running" }],
    ["Queued", { state: "running" }],
    ["Completed", { state: "completed", output: OUTPUT }],
    ["Failed", { state: "failed" }],
    ["Cancelled", { state: "failed" }],
  ])("reads a %s run", async (status, expected) => {
    const { fetch } = fakeFetch(() => Response.json({ data: [run(status, OUTPUT)] }));

    expect(await readRun(EVENT_ID, { ...cloud, fetch })).toEqual({ ok: true, run: expected });
  });

  it("reports no run while Inngest has not started one", async () => {
    const { fetch } = fakeFetch(() => Response.json({ data: [] }));

    expect(await readRun(EVENT_ID, { ...cloud, fetch })).toEqual({ ok: true, run: undefined });
  });

  it("refuses an event id that is not one Inngest gives", async () => {
    const { fetch, requests } = fakeFetch(() => Response.json({ data: [] }));

    expect(await readRun("../keys", { ...cloud, fetch })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(requests).toEqual([]);
  });

  it.each([
    ["a refused key", () => new Response("no", { status: 401 })],
    ["a server error", () => new Response("busy", { status: 500 })],
    ["an unexpected shape", () => Response.json({ runs: [] })],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
  ])("reports unavailable on %s", async (_, response) => {
    const { fetch } = fakeFetch(response);

    expect(await readRun(EVENT_ID, { ...cloud, fetch })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});
