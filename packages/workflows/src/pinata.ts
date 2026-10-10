import { z } from "zod";

/** How the Pinata adapter reaches Pinata's v3 API. */
export interface PinataOptions {
  /** A Pinata API key (JWT) allowed to sign uploads, list and delete files. Secret. */
  readonly jwt: string;
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
}

/** What a signed upload URL allows, on top of {@link PinataOptions}. */
export interface UploadUrlOptions extends PinataOptions {
  readonly maxBytes: number;
  /** Seconds the URL stays valid. */
  readonly expiresS: number;
  /** The current time in milliseconds. */
  readonly now: () => number;
}

/** The result of {@link createUploadUrl}. */
export type UploadUrlResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: "unavailable" };

/** A file pinned on Pinata's public network, as {@link findPublicFile} reads it. */
export interface PinnedFile {
  readonly id: string;
  readonly size: number;
  /** The type Pinata detected from the file's bytes. */
  readonly mimeType: string;
}

/** The result of {@link findPublicFile}: `unavailable` is worth trying again. */
export type FindFileResult =
  | { readonly ok: true; readonly file: PinnedFile }
  | { readonly ok: false; readonly reason: "missing" | "unavailable" };

/** The result of {@link deleteFile}. */
export type DeleteFileResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "unavailable" };

const UPLOADS = "https://uploads.pinata.cloud/v3";
const API = "https://api.pinata.cloud/v3";

const signed = z.object({ data: z.url() });
const listed = z.object({
  data: z.object({
    files: z.array(
      z.object({ id: z.string(), cid: z.string(), size: z.number(), mime_type: z.string() }),
    ),
  }),
});

/**
 * Signs a URL the browser uploads one PDF to, so the file never passes through our server
 * (ADR 0010). The URL caps the size, takes only `application/pdf` (Pinata checks the
 * detected type) and pins with `cid_version` `v1`, the setting the `publish-pdf` dev script
 * uses, so one PDF keeps one CID (`docs/domain.md` → IPFS). The browser chooses the
 * network at upload, so the server checks the pinned file before publishing it.
 * Never throws: any failure is `unavailable`, and never carries the key or Pinata's answer.
 */
export async function createUploadUrl(options: UploadUrlOptions): Promise<UploadUrlResult> {
  const body = await call(`${UPLOADS}/files/sign`, options, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      date: Math.floor(options.now() / 1000),
      expires: options.expiresS,
      max_file_size: options.maxBytes,
      allow_mime_types: ["application/pdf"],
      cid_version: "v1",
    }),
  });
  const parsed = signed.safeParse(body);
  return parsed.success
    ? { ok: true, url: parsed.data.data }
    : { ok: false, reason: "unavailable" };
}

/**
 * Finds the file pinned on Pinata's public network under `cid` in our account. Pinata
 * keeps one file per CID: an upload of bytes already pinned returns that file
 * (`docs/domain.md` → IPFS). A file only on the private network is `missing`.
 */
export async function findPublicFile(cid: string, options: PinataOptions): Promise<FindFileResult> {
  const body = await call(`${API}/files/public?cid=${encodeURIComponent(cid)}`, options, {});
  if (body === undefined) return { ok: false, reason: "unavailable" };
  const parsed = listed.safeParse(body);
  if (!parsed.success) return { ok: false, reason: "unavailable" };
  const file = parsed.data.data.files.find((listedFile) => listedFile.cid === cid);
  if (!file) return { ok: false, reason: "missing" };
  return { ok: true, file: { id: file.id, size: file.size, mimeType: file.mime_type } };
}

/**
 * Unpins a public file by its id. A file already gone counts as deleted (ADR 0007). Since
 * Pinata keeps one file per CID, this removes every upload of those bytes.
 */
export async function deleteFile(id: string, options: PinataOptions): Promise<DeleteFileResult> {
  const status = await callStatus(`${API}/files/public/${encodeURIComponent(id)}`, options, {
    method: "DELETE",
  });
  return status !== undefined && ((status >= 200 && status < 300) || status === 404)
    ? { ok: true }
    : { ok: false, reason: "unavailable" };
}

/** The JSON body of a 2xx answer, or undefined for anything else. */
async function call(url: string, options: PinataOptions, init: RequestInit): Promise<unknown> {
  try {
    const response = await send(url, options, init);
    if (!response.ok) {
      await response.body?.cancel();
      return undefined;
    }
    return await response.json();
  } catch {
    return undefined;
  }
}

/** The status of the answer, or undefined when none came. */
async function callStatus(
  url: string,
  options: PinataOptions,
  init: RequestInit,
): Promise<number | undefined> {
  try {
    const response = await send(url, options, init);
    await response.body?.cancel();
    return response.status;
  } catch {
    return undefined;
  }
}

function send(url: string, options: PinataOptions, init: RequestInit): Promise<Response> {
  return options.fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      authorization: `Bearer ${options.jwt}`,
    },
    signal: AbortSignal.timeout(options.timeoutMs),
  });
}
