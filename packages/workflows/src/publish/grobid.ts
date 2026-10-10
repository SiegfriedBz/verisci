/**
 * The result of {@link parseHeader}: `unreachable` is worth a retry; `unparseable` is final;
 * `unauthorized` (GROBID refused our credential) is a setup error.
 */
export type ParseHeaderResult =
  | { readonly ok: true; readonly tei: string }
  | { readonly ok: false; readonly reason: "unparseable" | "unreachable" | "unauthorized" };

/** Where and how {@link parseHeader} reaches GROBID. */
export interface GrobidOptions {
  readonly grobidUrl: string;
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
}

/**
 * Sends a PDF to GROBID's `processHeaderDocument` and returns the TEI of its header.
 * GROBID answers 204 when it finds nothing and 503 when it is busy (`docs/domain.md`), so
 * 204 and other 4xx are `unparseable`; 401 and 403 are `unauthorized`; 408, 429, 5xx, a
 * network error or a timeout are `unreachable`.
 * Never throws for an expected failure.
 */
export async function parseHeader(
  pdf: Uint8Array,
  options: GrobidOptions,
): Promise<ParseHeaderResult> {
  const form = new FormData();
  form.append(
    "input",
    new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
    "paper.pdf",
  );
  try {
    const response = await options.fetch(
      `${options.grobidUrl.replace(/\/+$/, "")}/api/processHeaderDocument`,
      {
        method: "POST",
        headers: { accept: "application/xml" },
        body: form,
        signal: AbortSignal.timeout(options.timeoutMs),
      },
    );
    const tei = await response.text();
    if (response.status === 401 || response.status === 403)
      return { ok: false, reason: "unauthorized" };
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      return { ok: false, reason: "unreachable" };
    }
    if (response.status !== 200) return { ok: false, reason: "unparseable" };
    return { ok: true, tei };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
