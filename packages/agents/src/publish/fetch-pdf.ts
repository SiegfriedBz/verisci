/** The result of {@link fetchPdf}: `unreachable` is worth a retry, the others are not. */
export type FetchPdfResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: "not-a-pdf" | "too-large" | "unreachable" };

/** Where and how {@link fetchPdf} reads a pinned file. */
export interface FetchPdfOptions {
  /** The Pinata dedicated gateway, `https://<name>.mypinata.cloud`. */
  readonly gatewayUrl: string;
  readonly fetch: typeof fetch;
  readonly maxBytes: number;
  readonly timeoutMs: number;
}

const PDF_MAGIC = new TextEncoder().encode("%PDF-");

/**
 * Reads a pinned PDF by its CID through the IPFS gateway. Stops reading once the file
 * passes `maxBytes`, and refuses a file that does not start with `%PDF-`. Never throws for
 * an expected failure: any status other than 2xx, a network error or a timeout is
 * `unreachable`.
 */
export async function fetchPdf(cid: string, options: FetchPdfOptions): Promise<FetchPdfResult> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  try {
    const response = await options.fetch(`${options.gatewayUrl.replace(/\/+$/, "")}/ipfs/${cid}`, {
      signal,
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return { ok: false, reason: "unreachable" };
    }
    if (Number(response.headers.get("content-length") ?? 0) > options.maxBytes) {
      await response.body.cancel();
      return { ok: false, reason: "too-large" };
    }
    const bytes = await readAtMost(response.body, options.maxBytes);
    if (!bytes) return { ok: false, reason: "too-large" };
    if (!startsWith(bytes, PDF_MAGIC)) return { ok: false, reason: "not-a-pdf" };
    return { ok: true, bytes };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** The whole stream, or undefined (and the stream cancelled) once it passes `maxBytes`. */
async function readAtMost(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array | undefined> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}
