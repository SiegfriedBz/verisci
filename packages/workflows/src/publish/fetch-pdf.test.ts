import { describe, expect, it } from "vitest";
import { fetchPdf } from "./fetch-pdf.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const GATEWAY = "https://example.mypinata.cloud/";
const PDF = new TextEncoder().encode("%PDF-1.5\nrest of the file");

function stream(chunks: Uint8Array[], onPull?: () => void) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.();
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });
}

function fakeFetch(response: () => Response | Promise<Response>) {
  const urls: string[] = [];
  const fetch = async (input: string | URL | Request) => {
    urls.push(String(input));
    return response();
  };
  return { fetch: fetch as typeof globalThis.fetch, urls };
}

function get(
  fetch: typeof globalThis.fetch,
  options: { maxBytes?: number; timeoutMs?: number } = {},
) {
  return fetchPdf(CID, {
    gatewayUrl: GATEWAY,
    fetch,
    maxBytes: options.maxBytes ?? 1000,
    timeoutMs: options.timeoutMs ?? 1000,
  });
}

describe("fetchPdf", () => {
  it("returns the bytes of a PDF from the gateway", async () => {
    const { fetch, urls } = fakeFetch(() => new Response(PDF));

    const result = await get(fetch);

    expect(result).toEqual({ ok: true, bytes: PDF });
    expect(urls).toEqual([`https://example.mypinata.cloud/ipfs/${CID}`]);
  });

  it("refuses bytes that do not start with %PDF-", async () => {
    const { fetch } = fakeFetch(() => new Response("<html>not a pdf</html>"));

    expect(await get(fetch)).toEqual({ ok: false, reason: "not-a-pdf" });
  });

  it("refuses a file whose content-length is over the cap, without reading it", async () => {
    let pulls = 0;
    const { fetch } = fakeFetch(
      () =>
        new Response(
          stream([PDF], () => {
            pulls++;
          }),
          { headers: { "content-length": "5000" } },
        ),
    );

    expect(await get(fetch)).toEqual({ ok: false, reason: "too-large" });
    expect(pulls).toBeLessThanOrEqual(1);
  });

  it("stops reading once the bytes pass the cap", async () => {
    let pulls = 0;
    const chunk = new Uint8Array(400).fill(65);
    chunk.set(PDF.subarray(0, 5));
    const { fetch } = fakeFetch(
      () =>
        new Response(
          stream([chunk, chunk, chunk, chunk, chunk, chunk], () => {
            pulls++;
          }),
        ),
    );

    expect(await get(fetch)).toEqual({ ok: false, reason: "too-large" });
    expect(pulls).toBeLessThan(6);
  });

  it.each([404, 500, 502])("reports unreachable on %i", async (status) => {
    const { fetch } = fakeFetch(() => new Response("nope", { status }));

    expect(await get(fetch)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports unreachable on a network error", async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError("fetch failed")));

    expect(await get(fetch)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports unreachable when the gateway does not answer in time", async () => {
    const fetch = ((_: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof globalThis.fetch;

    expect(await get(fetch, { timeoutMs: 10 })).toEqual({ ok: false, reason: "unreachable" });
  });
});
