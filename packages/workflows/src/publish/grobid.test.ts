import { describe, expect, it } from "vitest";
import { parseHeader } from "./grobid.ts";

const PDF = new TextEncoder().encode("%PDF-1.5\n");
const TEI = '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader/></TEI>';

function fakeFetch(response: () => Response | Promise<Response>) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return response();
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

function parse(fetch: typeof globalThis.fetch, timeoutMs = 1000) {
  return parseHeader(PDF, { grobidUrl: "http://127.0.0.1:8070/", fetch, timeoutMs });
}

describe("parseHeader", () => {
  it("posts the PDF to processHeaderDocument and returns the TEI", async () => {
    const { fetch, requests } = fakeFetch(() => new Response(TEI));

    expect(await parse(fetch)).toEqual({ ok: true, tei: TEI });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://127.0.0.1:8070/api/processHeaderDocument");
    expect(requests[0]?.init?.method).toBe("POST");
    const body = requests[0]?.init?.body;
    expect(body).toBeInstanceOf(FormData);
    const input = (body as FormData).get("input");
    expect(input).toBeInstanceOf(Blob);
    expect(new Uint8Array(await (input as Blob).arrayBuffer())).toEqual(PDF);
  });

  it.each([204, 400, 406, 415])("reports unparseable on %i", async (status) => {
    const { fetch } = fakeFetch(() => new Response(status === 204 ? null : "no", { status }));

    expect(await parse(fetch)).toEqual({ ok: false, reason: "unparseable" });
  });

  it.each([401, 403])("reports unauthorized on %i", async (status) => {
    const { fetch } = fakeFetch(() => new Response("no", { status }));

    expect(await parse(fetch)).toEqual({ ok: false, reason: "unauthorized" });
  });

  it.each([408, 429, 500, 503])("reports unreachable on %i", async (status) => {
    const { fetch } = fakeFetch(() => new Response("busy", { status }));

    expect(await parse(fetch)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports unreachable on a network error", async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError("fetch failed")));

    expect(await parse(fetch)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports unreachable when GROBID does not answer in time", async () => {
    const fetch = ((_: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof globalThis.fetch;

    expect(await parse(fetch, 10)).toEqual({ ok: false, reason: "unreachable" });
  });
});
