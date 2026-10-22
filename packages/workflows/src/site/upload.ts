import {
  canonicalContextGraph,
  type PaperRecord,
  paperRecordQuery,
  parsePaperRecord,
  parsePublishedAt,
  parseUal,
  publishedPaperQuery,
  targetKaName,
} from "@labstrail/core";
import { type AssetResult, createDkgClient } from "@labstrail/dkg";
import { baseSepolia } from "viem/chains";
import { inngest } from "../inngest.ts";
import {
  createUploadUrl,
  deleteFile,
  findPublicFile,
  type UploadUrlResult,
} from "../publish/pinata.ts";
import {
  PUBLISH_SETTINGS,
  type PublishFailure,
  type PublishLogger,
  publishFailureReason,
} from "../publish/publish-paper.ts";
import {
  type PaperSubmittedEvent,
  type SubmitLimiter,
  type SubmitResult,
  submitPaper,
} from "../publish/submit-paper.ts";
import { verifySubmission } from "../publish/verify-submission.ts";
import { createWorkflowsEnv, type WorkflowsEnv } from "../workflows-env.ts";
import { createSiteChainClient } from "./chain.ts";
import {
  checkSignature,
  listPapers,
  type PaperListResult,
  queryProblem,
  type SignatureCheck,
} from "./papers.ts";
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
  readonly signatureCheck: SignatureCheck;
  /** The UAL's author, which the asset's token is minted to: our DKG node's agent address. */
  readonly publisher: string | undefined;
  /** When the node minted it, as an ISO date-time; absent when the node did not give it. */
  readonly publishedAt?: string;
}

/** What the DKG and Inngest say about a paper, for the page to show as one stage. */
export interface PaperStatus {
  readonly asset: AssetResult;
  /** Undefined when the page has no event id to ask about. */
  readonly run: ReadRunResult | undefined;
  /** The record, once minted and readable. */
  readonly record?: PublishedRecord;
  /**
   * Why a minted paper has no record: the node did not answer the query, asked to retry,
   * answered 429 or a server error (`unavailable`, worth asking again); or it refused it,
   * answered none that parses, or the asset's UAL names another agent than our node, which
   * is never queried (`unreadable`) (ADR 0021).
   */
  readonly recordProblem?: "unavailable" | "unreadable";
  /** Why the run stopped, when it failed with a reason it names. */
  readonly failure?: PublishFailure;
}

/**
 * What the site's pages call, built from the workflows' settings (ADR 0003, ADR 0010): the
 * upload page's calls, the paper page's read, and the papers list.
 */
export interface UploadService {
  /** This environment's context graph id, in the spelling a submission signs. */
  readonly contextGraph: string;
  /** A signed URL the browser uploads one PDF to. */
  createUploadUrl(): Promise<UploadUrlResult>;
  /** Checks a signed submission and starts its publish run ({@link submitPaper}). */
  submitPaper(input: unknown, limiter: SubmitLimiter): Promise<SubmitResult>;
  /** The paper's Target KA state, its record once minted, and, given the event id, its publish run. */
  readPaper(cid: string, eventId?: string): Promise<PaperStatus>;
  /** One page of this graph's published papers, newest mint first, with the total ({@link listPapers}). */
  listPapers(options: {
    readonly page: number;
    readonly pageSize: number;
  }): Promise<PaperListResult>;
}

/** The IO {@link createUploadService} uses; tests pass fakes. */
export interface UploadIo {
  readonly fetch: typeof fetch;
  /** Sends an event and returns Inngest's id for it. */
  send(event: PaperSubmittedEvent): Promise<string>;
  readonly now: () => number;
  /** Where a submission names a service that gave no answer: the server's log. */
  readonly logger: Pick<PublishLogger, "warn">;
}

/** Builds the pages' calls from validated settings. */
export function createUploadService(env: WorkflowsEnv, io: UploadIo): UploadService {
  const pinata = { jwt: env.PINATA_JWT, fetch: io.fetch, timeoutMs: PAGE_TIMEOUT_MS };
  const chain = createSiteChainClient(baseSepolia, env.CHAIN_RPC_URL, io.fetch);
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

  /** When the node minted `ual`, or `undefined` when it does not say: the record stands without it. */
  async function readPublishedAt(ual: string): Promise<string | undefined> {
    const sparql = publishedPaperQuery(env.DKG_CONTEXT_GRAPH, ual);
    if (!sparql) return undefined;
    const answer = await dkg.query(sparql);
    return answer.ok ? parsePublishedAt(answer.bindings) : undefined;
  }

  /** The record of a minted paper, its mint time and signature check, or why it cannot be shown. */
  async function readRecord(
    cid: string,
    ual: string,
  ): Promise<
    | { readonly ok: true; readonly record: PublishedRecord }
    | { readonly ok: false; readonly reason: "unavailable" | "unreadable" }
  > {
    const sparql = paperRecordQuery(cid, env.DKG_CONTEXT_GRAPH, ual);
    if (!sparql) return { ok: false, reason: "unreadable" };
    const [answer, publishedAt] = await Promise.all([dkg.query(sparql), readPublishedAt(ual)]);
    if (!answer.ok) return { ok: false, reason: queryProblem(answer) };
    const record = parsePaperRecord(cid, answer.bindings);
    if (!record) return { ok: false, reason: "unreadable" };
    const check = await checkSignature(
      { ...record, cid, contextGraph: canonicalContextGraph(env.DKG_CONTEXT_GRAPH) },
      chain,
    );
    const parsed = parseUal(ual);
    return {
      ok: true,
      record: {
        ...record,
        deadline: record.deadline.toString(),
        signatureCheck: check,
        publisher: parsed.ok ? parsed.ual.address : undefined,
        ...(publishedAt === undefined ? {} : { publishedAt }),
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
        logger: io.logger,
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
    listPapers: (options) =>
      listPapers(options, { contextGraph: env.DKG_CONTEXT_GRAPH, query: dkg.query, chain }),
  };
}

let service: UploadService | undefined;

/**
 * The pages' calls, built on first use from `process.env` (they throw `EnvError`
 * when a setting is bad, which a deployed server catches at start). Events go through
 * LabsTrail's Inngest client.
 */
export function getUploadService(): UploadService {
  service ??= createUploadService(createWorkflowsEnv(), {
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
    logger: console,
  });
  return service;
}
