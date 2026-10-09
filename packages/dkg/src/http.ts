import type { DkgFailure } from "./types.ts";

/** What the node did with one request: answered (any status), timed out, or was unreachable. */
export type Reply =
  | { readonly kind: "answer"; readonly status: number; readonly body: unknown }
  | { readonly kind: "timeout" }
  | { readonly kind: "network-error" };

/** Where and how to reach the node. */
export interface Connection {
  readonly url: string;
  readonly token: string;
  readonly fetch: typeof fetch;
}

/**
 * Sends one JSON request to the node with the bearer token and returns its reply. Never
 * throws for a network error or a timeout, so callers can tell "no answer" from a refusal.
 */
export async function send(
  connection: Connection,
  method: "GET" | "POST",
  path: string,
  options: { readonly body?: unknown; readonly timeoutMs: number },
): Promise<Reply> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  try {
    const response = await connection.fetch(`${connection.url.replace(/\/+$/, "")}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${connection.token}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    return { kind: "answer", status: response.status, body: parseJson(await response.text()) };
  } catch {
    return signal.aborted ? { kind: "timeout" } : { kind: "network-error" };
  }
}

/** True for a 2xx answer. */
export function isSuccess(reply: Reply): boolean {
  return reply.kind === "answer" && reply.status >= 200 && reply.status < 300;
}

/** The node's error code (`{ code }` in its error bodies), if any. */
export function errorCode(reply: Reply): string | undefined {
  if (reply.kind !== "answer") return undefined;
  const code = field(reply.body, "code");
  return typeof code === "string" ? code : undefined;
}

/** Turns a reply the caller cannot use into a failure that carries no secret. */
export function toFailure(reply: Reply): DkgFailure {
  if (reply.kind !== "answer") return { ok: false, reason: "unreachable" };
  if (reply.status === 401 || reply.status === 403) {
    return { ok: false, reason: "unauthorized", status: reply.status };
  }
  const code = errorCode(reply);
  return {
    ok: false,
    reason: "unexpected",
    status: reply.status,
    ...(code === undefined ? {} : { code }),
  };
}

/** Reads one field of a JSON object body; `undefined` for anything else. */
export function field(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)[key]
    : undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
