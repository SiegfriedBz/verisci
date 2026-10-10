import { describe, expect, it } from "vitest";
import { createUploadUrl, deleteFile, findPublicFile } from "./pinata.ts";

const JWT = "test-jwt";
const CID = "bafybeicrwkcuhyibpnbzadvjw46tl7s5pl5k5rbf4iaega4x3odats642m";
const SIGNED_URL = "https://uploads.pinata.cloud/v3/files/01a125dd-060c-7f1e-b6a2-65afcd14c662";

interface Recorded {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(response: (url: string) => Response | Promise<Response>) {
  const requests: Recorded[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return response(String(input));
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

function options(fetch: typeof globalThis.fetch) {
  return { jwt: JWT, fetch, timeoutMs: 1000 };
}

const networkError = () => Promise.reject(new TypeError("fetch failed"));
const hang = ((_: string, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  })) as typeof globalThis.fetch;

describe("createUploadUrl", () => {
  const upload = { maxBytes: 30_000_000, expiresS: 300, now: () => 1_800_000_000_123 };

  it("signs a URL for one PDF, capped in size, with CIDv1 and an expiry", async () => {
    const { fetch, requests } = fakeFetch(() => Response.json({ data: SIGNED_URL }));

    expect(await createUploadUrl({ ...options(fetch), ...upload })).toEqual({
      ok: true,
      url: SIGNED_URL,
    });
    expect(requests[0]?.url).toBe("https://uploads.pinata.cloud/v3/files/sign");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(`Bearer ${JWT}`);
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      date: 1_800_000_000,
      expires: 300,
      max_file_size: 30_000_000,
      allow_mime_types: ["application/pdf"],
      cid_version: "v1",
    });
  });

  it.each([
    ["a refused key", () => new Response("no", { status: 401 })],
    ["a server error", () => new Response("busy", { status: 500 })],
    ["an answer with no URL", () => Response.json({ data: 42 })],
    ["a body that is not JSON", () => new Response("<html>")],
    ["a network error", networkError],
  ])("reports unavailable on %s", async (_, response) => {
    const { fetch } = fakeFetch(response);

    expect(await createUploadUrl({ ...options(fetch), ...upload })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("reports unavailable when Pinata does not answer in time", async () => {
    expect(await createUploadUrl({ jwt: JWT, fetch: hang, timeoutMs: 10, ...upload })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("findPublicFile", () => {
  const file = {
    id: "file-1",
    name: "attention.pdf",
    cid: CID,
    size: 2_215_703,
    number_of_files: 1,
    mime_type: "application/pdf",
    group_id: null,
    keyvalues: {},
    created_at: "2026-10-10T12:50:49.643Z",
    expires_at: null,
  };

  it("finds the public file with that CID", async () => {
    const { fetch, requests } = fakeFetch(() =>
      Response.json({ data: { files: [file], next_page_token: null } }),
    );

    expect(await findPublicFile(CID, options(fetch))).toEqual({
      ok: true,
      file: { id: "file-1", size: 2_215_703, mimeType: "application/pdf" },
    });
    expect(requests[0]?.url).toBe(`https://api.pinata.cloud/v3/files/public?cid=${CID}`);
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(`Bearer ${JWT}`);
  });

  it("reports missing when no public file has that CID", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json({ data: { files: [], next_page_token: null } }),
    );

    expect(await findPublicFile(CID, options(fetch))).toEqual({ ok: false, reason: "missing" });
  });

  it("ignores a listed file with another CID", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json({ data: { files: [{ ...file, cid: "bafkother" }], next_page_token: null } }),
    );

    expect(await findPublicFile(CID, options(fetch))).toEqual({ ok: false, reason: "missing" });
  });

  it.each([
    ["a refused key", () => new Response("no", { status: 401 })],
    ["a server error", () => new Response("busy", { status: 503 })],
    ["an unexpected shape", () => Response.json({ data: { files: [{ id: 1 }] } })],
    ["a network error", networkError],
  ])("reports unavailable on %s", async (_, response) => {
    const { fetch } = fakeFetch(response);

    expect(await findPublicFile(CID, options(fetch))).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("deleteFile", () => {
  it("deletes a public file by its id", async () => {
    const { fetch, requests } = fakeFetch(() => Response.json({ data: null }));

    expect(await deleteFile("file-1", options(fetch))).toEqual({ ok: true });
    expect(requests[0]?.url).toBe("https://api.pinata.cloud/v3/files/public/file-1");
    expect(requests[0]?.init?.method).toBe("DELETE");
  });

  it("treats a file already gone as deleted", async () => {
    const { fetch } = fakeFetch(() => new Response("gone", { status: 404 }));

    expect(await deleteFile("file-1", options(fetch))).toEqual({ ok: true });
  });

  it.each([
    ["a server error", () => new Response("busy", { status: 500 })],
    ["a network error", networkError],
  ])("reports unavailable on %s", async (_, response) => {
    const { fetch } = fakeFetch(response);

    expect(await deleteFile("file-1", options(fetch))).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});
