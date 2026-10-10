import { z } from "zod";

/** Where a run stands: still going, finished with the function's return value, or failed. */
export type RunState =
  | { readonly state: "running" }
  | { readonly state: "completed"; readonly output: unknown }
  | { readonly state: "failed" };

/**
 * The result of {@link readRun}: `run` is undefined while Inngest has not started one for
 * the event. `unavailable` is worth asking again.
 */
export type ReadRunResult =
  | { readonly ok: true; readonly run: RunState | undefined }
  | { readonly ok: false; readonly reason: "unavailable" };

/** Where {@link readRun} asks: Inngest Cloud, or the dev server locally. */
export interface ReadRunOptions {
  /** `https://api.inngest.com`, or the dev server's URL. */
  readonly apiUrl: string;
  /** Inngest's signing key; the dev server needs none. Secret. */
  readonly signingKey?: string;
  /** The branch environment's name; none for production (`docs/domain.md` → Inngest). */
  readonly branch?: string;
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
}

/** Inngest's event ids are ULIDs; anything else never reaches the URL. */
const EVENT_ID = /^[0-9A-Za-z]{1,64}$/;

const runs = z.object({
  data: z.array(z.object({ status: z.string(), output: z.unknown().optional() })),
});

/**
 * Reads the run Inngest started for an event (REST `GET /v1/events/{id}/runs`): the first
 * one, since a publish event starts one function. `Completed` gives the function's
 * output; `Failed` and `Cancelled` read as `failed`; any other status as `running`. Never
 * throws for an expected failure, and never carries the key.
 */
export async function readRun(eventId: string, options: ReadRunOptions): Promise<ReadRunResult> {
  if (!EVENT_ID.test(eventId)) return { ok: false, reason: "unavailable" };
  const headers: Record<string, string> = {};
  if (options.signingKey) headers.authorization = `Bearer ${options.signingKey}`;
  if (options.branch) headers["x-inngest-env"] = options.branch;
  try {
    const response = await options.fetch(
      `${options.apiUrl.replace(/\/+$/, "")}/v1/events/${eventId}/runs`,
      { headers, signal: AbortSignal.timeout(options.timeoutMs) },
    );
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, reason: "unavailable" };
    }
    const parsed = runs.safeParse(await response.json());
    if (!parsed.success) return { ok: false, reason: "unavailable" };
    const [first] = parsed.data.data;
    if (!first) return { ok: true, run: undefined };
    if (first.status === "Completed")
      return { ok: true, run: { state: "completed", output: first.output } };
    if (first.status === "Failed" || first.status === "Cancelled")
      return { ok: true, run: { state: "failed" } };
    return { ok: true, run: { state: "running" } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
