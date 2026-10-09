/** The result of {@link parseHeader}: `unreachable` is worth a retry, `unparseable` is not. */
export type ParseHeaderResult =
  | { readonly ok: true; readonly tei: string }
  | { readonly ok: false; readonly reason: "unparseable" | "unreachable" };

/** Where and how {@link parseHeader} reaches GROBID. */
export interface GrobidOptions {
  readonly grobidUrl: string;
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
}

/**
 * Sends a PDF to GROBID's `processHeaderDocument` and returns the TEI of its header.
 * GROBID answers 204 when it finds nothing and 503 when it is busy (`docs/domain.md`), so
 * 204 and 4xx are `unparseable`; 5xx, a network error or a timeout are `unreachable`.
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
    if (response.status >= 500) return { ok: false, reason: "unreachable" };
    if (response.status !== 200) return { ok: false, reason: "unparseable" };
    return { ok: true, tei };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
