import { z } from "zod";

/** Where a run stands: still going, finished with the function's return value, or failed. */
export type RunState =
  | { readonly state: "running" }
  | {
      readonly state: "completed";
      readonly output: unknown;
      /** When the run ended, in milliseconds, if Inngest says. */
      readonly endedAt: number | undefined;
    }
  | {
      readonly state: "failed";
      /** The run's error as Inngest gives it, which carries why the run stopped. */
      readonly output: unknown;
    };

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
  /**
   * The local dev server, whose REST read answers an empty output: the output is then read
   * from its GraphQL API instead (`docs/domain.md` → Inngest).
   */
  readonly devServer?: boolean;
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
}

/** Inngest's event ids are ULIDs; anything else never reaches the URL. */
const EVENT_ID = /^[0-9A-Za-z]{1,64}$/;

const runs = z.object({
  data: z.array(
    z.object({
      run_id: z.string().optional(),
      status: z.string(),
      output: z.unknown().optional(),
      ended_at: z.string().nullish(),
    }),
  ),
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
    const ended = ["Completed", "Failed", "Cancelled"].includes(first.status);
    const output =
      ended && options.devServer && !first.output && first.run_id
        ? await devServerOutput(first.run_id, options)
        : first.output;
    if (first.status === "Completed") {
      const endedAt = first.ended_at ? Date.parse(first.ended_at) : Number.NaN;
      return {
        ok: true,
        run: {
          state: "completed",
          output,
          endedAt: Number.isNaN(endedAt) ? undefined : endedAt,
        },
      };
    }
    if (first.status === "Failed" || first.status === "Cancelled")
      return { ok: true, run: { state: "failed", output } };
    return { ok: true, run: { state: "running" } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

const devRun = z.object({ data: z.object({ run: z.object({ output: z.string().nullish() }) }) });
const runComplete = z
  .array(z.unknown())
  .transform((ops) =>
    ops.find(
      (op): op is { op: string; data: unknown } =>
        typeof op === "object" && op !== null && (op as { op?: unknown }).op === "RunComplete",
    ),
  );

/**
 * A run's output from the dev server's GraphQL API: the `RunComplete` op's data for a run
 * that returned, the raw text otherwise (a failed run's error), or `""` when it cannot be
 * read.
 */
async function devServerOutput(runId: string, options: ReadRunOptions): Promise<unknown> {
  try {
    const response = await options.fetch(`${options.apiUrl.replace(/\/+$/, "")}/v0/gql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "query ($id: String!) { run(runID: $id) { output } }",
        variables: { id: runId },
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return "";
    }
    const parsed = devRun.safeParse(await response.json());
    const text = parsed.success ? (parsed.data.data.run.output ?? "") : "";
    try {
      const complete = runComplete.safeParse(JSON.parse(text));
      if (complete.success && complete.data) return complete.data.data;
    } catch {
      // Not JSON: a failed run's text, kept as it is.
    }
    return text;
  } catch {
    return "";
  }
}
