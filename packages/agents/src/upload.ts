import {
  canonicalContextGraph,
  type PaperRecord,
  paperRecordQuery,
  parsePaperRecord,
  parseUal,
  targetKaName,
} from "@verisci/core";
import { type AssetResult, createDkgClient, type DkgFailure } from "@verisci/dkg";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { type AgentsEnv, createAgentsEnv } from "./agents-env.ts";
import { inngest } from "./inngest.ts";
import { createUploadUrl, deleteFile, findPublicFile, type UploadUrlResult } from "./pinata.ts";
import {
  PUBLISH_SETTINGS,
  type PublishFailure,
  publishFailureReason,
} from "./publish/publish-paper.ts";
import {
  type PaperSubmittedEvent,
  type SubmitLimiter,
  type SubmitResult,
  submitPaper,
} from "./publish/submit-paper.ts";
import { signatureMatches, verifySubmission } from "./publish/verify-submission.ts";
import { type ReadRunResult, readRun } from "./runs.ts";

/** The upload page's timings, in seconds. */
export const UPLOAD_SETTINGS = {
  /** How long a signed upload URL stays valid. */
  urlLifetimeS: 300,
  /** How far ahead the page sets a submission's deadline; the run refuses one past a day. */
  signatureLifetimeS: 600,
} as const;

/** How long Pinata, the DKG node and Inngest each get to answer the page. */
const PAGE_TIMEOUT_MS = 15_000;
/** The Inngest dev server's address, where `APP_ENV=local` sends events and reads runs. */
const INNGEST_DEV_URL = "http://127.0.0.1:8288";
const INNGEST_API_URL = "https://api.inngest.com";

/** A minted paper's record, read back from the DKG, with what anyone can check about it. */
export interface PublishedRecord extends Omit<PaperRecord, "deadline"> {
  /** The signed deadline, in Unix seconds, as a decimal string (JSON has no bigint). */
  readonly deadline: string;
  /** Whether the signature is the submitter's, checked when read: `unknown` if the chain did not answer. */
  readonly signatureCheck: "valid" | "invalid" | "unknown";
  /** The UAL's author, which the asset's token is minted to: our DKG node's agent address. */
  readonly publisher: string | undefined;
}

/** What the DKG and Inngest say about a paper, for the page to show as one stage. */
export interface PaperStatus {
  readonly asset: AssetResult;
  /** Undefined when the page has no event id to ask about. */
  readonly run: ReadRunResult | undefined;
  /** The record, once minted and readable. */
  readonly record?: PublishedRecord;
  /**
   * Why a minted paper has no record: the node did not answer the query, asked to retry or
   * answered a server error (`unavailable`, worth asking again), or refused it or answered
   * none that parses (`unreadable`) (ADR 0021).
   */
  readonly recordProblem?: "unavailable" | "unreadable";
  /** Why the run stopped, when it failed with a reason it names. */
  readonly failure?: PublishFailure;
}

/** What the upload page calls, built from the agents' settings (ADR 0003, ADR 0010). */
export interface UploadService {
  /** This environment's context graph id, in the spelling a submission signs. */
  readonly contextGraph: string;
  /** A signed URL the browser uploads one PDF to. */
  createUploadUrl(): Promise<UploadUrlResult>;
  /** Checks a signed submission and starts its publish run ({@link submitPaper}). */
  submitPaper(input: unknown, limiter: SubmitLimiter): Promise<SubmitResult>;
  /** The paper's Target KA state, its record once minted, and, given the event id, its publish run. */
  readPaper(cid: string, eventId?: string): Promise<PaperStatus>;
}

/** The IO {@link createUploadService} uses; tests pass fakes. */
export interface UploadIo {
  readonly fetch: typeof fetch;
  /** Sends an event and returns Inngest's id for it. */
  send(event: PaperSubmittedEvent): Promise<string>;
  readonly now: () => number;
}

/** Builds the upload page's calls from validated settings. */
export function createUploadService(env: AgentsEnv, io: UploadIo): UploadService {
  const pinata = { jwt: env.PINATA_JWT, fetch: io.fetch, timeoutMs: PAGE_TIMEOUT_MS };
  const chain = createPublicClient({ chain: baseSepolia, transport: http(env.CHAIN_RPC_URL) });
  const dkg = createDkgClient({
    url: env.DKG_URL,
    token: env.DKG_TOKEN,
    contextGraphId: env.DKG_CONTEXT_GRAPH,
    timeoutMs: PAGE_TIMEOUT_MS,
    fetch: io.fetch,
  });
  const local = env.APP_ENV === "local";
  const runs = {
    apiUrl: local ? INNGEST_DEV_URL : INNGEST_API_URL,
    devServer: local,
    signingKey: env.INNGEST_SIGNING_KEY,
    branch: env.APP_ENV === "staging" ? env.VERCEL_GIT_COMMIT_REF : undefined,
    fetch: io.fetch,
    timeoutMs: PAGE_TIMEOUT_MS,
  };

  /** The record of a minted paper and its signature check, or why it cannot be shown. */
  async function readRecord(
    cid: string,
    ual: string,
  ): Promise<
    | { readonly ok: true; readonly record: PublishedRecord }
    | { readonly ok: false; readonly reason: "unavailable" | "unreadable" }
  > {
    const sparql = paperRecordQuery(cid);
    if (!sparql) return { ok: false, reason: "unreadable" };
    const answer = await dkg.query(sparql);
    if (!answer.ok) return { ok: false, reason: passing(answer) ? "unavailable" : "unreadable" };
    const record = parsePaperRecord(cid, answer.bindings);
    if (!record) return { ok: false, reason: "unreadable" };
    const matches = await signatureMatches(
      { ...record, cid, contextGraph: canonicalContextGraph(env.DKG_CONTEXT_GRAPH) },
      chain,
    );
    const parsed = parseUal(ual);
    return {
      ok: true,
      record: {
        ...record,
        deadline: record.deadline.toString(),
        signatureCheck: matches === "unreachable" ? "unknown" : matches ? "valid" : "invalid",
        publisher: parsed.ok ? parsed.ual.address : undefined,
      },
    };
  }

  return {
    contextGraph: canonicalContextGraph(env.DKG_CONTEXT_GRAPH),
    createUploadUrl: () =>
      createUploadUrl({
        ...pinata,
        maxBytes: PUBLISH_SETTINGS.maxPdfBytes,
        expiresS: UPLOAD_SETTINGS.urlLifetimeS,
        now: io.now,
      }),
    submitPaper: (input, limiter) =>
      submitPaper(input, {
        verify: (data) =>
          verifySubmission(data, {
            contextGraph: env.DKG_CONTEXT_GRAPH,
            client: chain,
            now: io.now,
          }),
        limiter,
        readAsset: (cid) => {
          const name = targetKaName(cid);
          return name.ok
            ? dkg.readAsset(name.name)
            : Promise.resolve<AssetResult>({ ok: true, state: "missing" });
        },
        findFile: (cid) => findPublicFile(cid, pinata),
        deleteFile: (id) => deleteFile(id, pinata),
        send: io.send,
        maxBytes: PUBLISH_SETTINGS.maxPdfBytes,
      }),
    readPaper: async (cid, eventId) => {
      const name = targetKaName(cid);
      const [asset, run] = await Promise.all([
        name.ok
          ? dkg.readAsset(name.name)
          : Promise.resolve<AssetResult>({ ok: true, state: "missing" }),
        eventId === undefined ? undefined : readRun(eventId, runs),
      ]);
      const failed = run?.ok && run.run?.state === "failed" ? run.run.output : undefined;
      const failure = failed === undefined ? undefined : publishFailureReason(failed);
      if (!asset.ok || asset.state !== "minted")
        return failure ? { asset, run, failure } : { asset, run };
      const read = await readRecord(cid, asset.ual);
      return read.ok
        ? { asset, run, record: read.record }
        : { asset, run, recordProblem: read.reason };
    },
  };
}

/** Whether a failed query may pass: no answer, a retry asked for, or a server error. */
function passing(failure: DkgFailure): boolean {
  return (
    failure.reason === "unreachable" ||
    failure.reason === "retry-later" ||
    (failure.status !== undefined && failure.status >= 500)
  );
}

let service: UploadService | undefined;

/**
 * The upload page's calls, built on first use from `process.env` (they throw `EnvError`
 * when a setting is bad, which a deployed server catches at start). Events go through
 * verisci's Inngest client.
 */
export function getUploadService(): UploadService {
  service ??= createUploadService(createAgentsEnv(), {
    fetch: (input, init) => fetch(input, init),
    send: async (event) => {
      const { ids } = await inngest.send({
        id: event.id,
        name: event.name,
        data: { ...event.data },
      });
      const [id] = ids;
      if (!id) throw new Error("Inngest returned no event id");
      return id;
    },
    now: Date.now,
  });
  return service;
}
