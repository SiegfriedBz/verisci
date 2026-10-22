import type { RatingRequestState, ReadRequestResult } from "@labstrail/contracts";
import {
  type PaperText,
  paperPdfQuery,
  publishedPaperQuery,
  type QueryBinding,
  rKaQuads,
  SCORER_PROMPT_VERSION,
  type ScorerOutput,
  type Triple,
} from "@labstrail/core";
import type { AssetResult, DkgFailure, MintResult, QueryResult } from "@labstrail/dkg";
import { Inngest, NonRetriableError } from "inngest";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import type { Notice } from "../alerts/notify.ts";
import type { ReadPaperTextResult } from "../pdf/paper-text.ts";
import type { FieldCheckResult } from "../publish/field-check.ts";
import { PUBLISH_SETTINGS } from "../publish/publish-paper.ts";
import type { OracleInput, OracleResult } from "./oracle.ts";
import {
  createRatePaper,
  loadRatingDeps,
  RATING_SETTINGS,
  type RatingDeps,
  type RatingSteps,
  ratingFailureReason,
  runRating,
} from "./rate-paper.ts";
import { RECONCILER_SETTINGS } from "./reconciler.ts";
import type { ScoreResult } from "./scorer.ts";

const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const ORACLE = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const GRAPH = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging";
const AGENT = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3";
const TARGET = `did:dkg:base:84532/${AGENT}/7`;
const R_KA = `did:dkg:base:84532/${AGENT}/12`;
const REQUEST_ID = `0x${"ab".repeat(32)}` as Hex;
const NAME = `verisci-rka-${REQUEST_ID}`;
const NOW = 1_800_000_000_000;
const SITE = "https://labstrail.example";
const YOUNG = NOW / 1000 - 60;
const OLD = NOW / 1000 - 25 * 3600;
const EVENT = { contract: CONTRACT, requestId: REQUEST_ID };
const ELSEWHERE = "did:dkg:base:84532/0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111/3";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const PAPER: PaperText = {
  text: "A trial.\nWe needed 60 patients for 80% power.",
  shortened: false,
};
const OUTPUT: ScorerOutput = {
  score: 72,
  rationale: "The paper reports its sample size.",
  studyType: "randomized-trial",
  checks: [{ id: "sample-size", answer: "shown", quote: "We needed 60 patients for 80% power." }],
};
const MODEL = "gemini-3.8-flash-001";
const rows = (triples: readonly Triple[]): QueryBinding[] =>
  triples.map((t) => ({ s: t.subject, p: t.predicate, o: t.object }));
const ratingRows = (score: number) =>
  rows(
    rKaQuads({
      requestId: REQUEST_ID,
      targetUal: TARGET,
      contract: `eip155:31337:${CONTRACT}`,
      output: { ...OUTPUT, score },
      model: MODEL,
      promptVersion: SCORER_PROMPT_VERSION,
      textShortened: false,
    }),
  );

const missing: AssetResult = { ok: true, state: "missing" };
const draft: AssetResult = { ok: true, state: "draft" };
const stored: AssetResult = { ok: true, state: "stored", reservedUal: R_KA };
const minted: AssetResult = { ok: true, state: "minted", ual: R_KA };
const minting: MintResult = { ok: true, state: "minting" };
const mintedNow: MintResult = { ok: true, state: "minted", ual: R_KA };
const unreachable = { ok: false as const, reason: "unreachable" as const };
/** The gateway not giving the PDF, as `readPaperText` reports it. */
const gatewayDown = { ok: false as const, reason: "unreachable" as const, detail: "HTTP 504" };
const LITE = "gemini-3.5-flash-lite-001";
const inField: FieldCheckResult = {
  ok: true,
  field: "life-sciences",
  reason: "A trial.",
  model: LITE,
};

const pending = (state: Partial<RatingRequestState> = {}): ReadRequestResult => ({
  ok: true,
  request: {
    status: "pending",
    cancelReason: "none",
    requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
    requestedAt: YOUNG,
    score: 0,
    targetUal: TARGET,
    rKaUal: "",
    ...state,
  },
});

/**
 * Steps that run at once and record every step id, sleep and oracle call. Like Inngest, they
 * share one set of ids, and an id used twice in a run fails it.
 */
function fakeSteps(oracleAnswer: (input: OracleInput) => OracleResult) {
  const log: string[] = [];
  const oracleCalls: OracleInput[] = [];
  const ids = new Set<string>();
  const once = (id: string) => {
    if (ids.has(id)) throw new Error(`step id used twice: ${id}`);
    ids.add(id);
  };
  const step: RatingSteps = {
    async run(id, fn) {
      once(id);
      log.push(id);
      return JSON.parse(JSON.stringify(await fn()));
    },
    async sleep(id, duration) {
      once(id);
      log.push(`sleep ${id} ${duration}`);
    },
    async oracle(id, input) {
      once(id);
      log.push(`oracle ${id}`);
      oracleCalls.push(input);
      return oracleAnswer(input);
    },
  };
  return { step, log, oracleCalls };
}

interface Script {
  requests?: ReadRequestResult[];
  oracle?: string;
  reads?: AssetResult[];
  stores?: AssetResult[];
  mints?: MintResult[];
  found?: QueryResult[];
  graph?: ({ ok: true } | DkgFailure)[];
  pdfRows?: QueryResult[];
  ratingRows?: QueryResult[];
  papers?: ReadPaperTextResult[];
  scores?: ScoreResult[];
  fields?: FieldCheckResult[];
  oracleAnswer?: (input: OracleInput) => OracleResult;
}

/** The oracle settling whatever it is asked to, as a mined transaction would. */
function settles(input: OracleInput): OracleResult {
  return input.action.kind === "fulfil"
    ? { state: "fulfilled", score: input.action.score, rKaUal: input.action.rKaUal }
    : { state: "cancelled", reason: input.action.reason };
}

function rate(script: Script, data: unknown = EVENT) {
  const next = <T>(answers: T[]): T =>
    answers.length > 1 ? (answers.shift() as T) : (answers[0] as T);
  const requests = [...(script.requests ?? [pending()])];
  const reads = [...(script.reads ?? [missing])];
  const stores = [...(script.stores ?? [stored])];
  const mints = [...(script.mints ?? [mintedNow])];
  const found = [...(script.found ?? [{ ok: true, bindings: [{ ka: TARGET }] }])];
  const graph = [...(script.graph ?? [{ ok: true as const }])];
  const pdfRows = [
    ...(script.pdfRows ?? [
      {
        ok: true,
        bindings: [{ url: `ipfs://${CID}`, title: '"A trial"', abstract: '"Sixty patients."' }],
      },
    ]),
  ];
  const ratingRowsAnswers = [
    ...(script.ratingRows ?? [{ ok: true, bindings: ratingRows(OUTPUT.score) }]),
  ];
  const papers = [...(script.papers ?? [{ ok: true, paper: PAPER }])];
  const scores = [
    ...(script.scores ?? [{ ok: true, field: "life-sciences", output: OUTPUT, model: MODEL }]),
  ];
  const fields = [...(script.fields ?? [inField])];
  const foundQuery = publishedPaperQuery(GRAPH, TARGET);
  const pdfQuery = paperPdfQuery(GRAPH, TARGET);
  const dkg = {
    readAsset: vi.fn(async () => next(reads)),
    storeAsset: vi.fn(async () => next(stores)),
    startMint: vi.fn(async () => next(mints)),
    checkGraph: vi.fn(async () => next(graph)),
    query: vi.fn(async (sparql: string) => {
      if (sparql === foundQuery) return next(found);
      return sparql === pdfQuery ? next(pdfRows) : next(ratingRowsAnswers);
    }),
  };
  const deps = {
    contracts: [CONTRACT],
    oracle: ORACLE,
    contextGraph: GRAPH,
    chainId: 31337,
    now: () => NOW,
    readRequest: vi.fn(async () => next(requests)),
    readOracle: vi.fn(async () => ({ ok: true as const, oracle: script.oracle ?? ORACLE })),
    dkg: dkg as unknown as RatingDeps["dkg"],
    readPaper: vi.fn(async () => next(papers)),
    score: vi.fn(async () => next(scores)),
    checkField: vi.fn(async () => next(fields)),
    notify: vi.fn(async (_notice: Notice) => {}),
    siteUrl: SITE,
  } satisfies RatingDeps;
  const { step, log, oracleCalls } = fakeSteps(script.oracleAnswer ?? settles);
  const logger = { error: vi.fn() };
  return { run: runRating(data, step, deps, logger), deps, dkg, log, oracleCalls, logger };
}

const fulfil = (score: number, rKaUal = R_KA): OracleInput => ({
  contract: CONTRACT,
  requestId: REQUEST_ID,
  action: { kind: "fulfil", score, rKaUal },
});
const cancel = (reason: "expired" | "invalid-target"): OracleInput => ({
  contract: CONTRACT,
  requestId: REQUEST_ID,
  action: { kind: "cancel", reason },
});

describe("runRating: which requests it takes", () => {
  it.each([
    ["no data", null],
    ["an uppercase contract", { ...EVENT, contract: CONTRACT.toUpperCase() }],
    ["a short request id", { ...EVENT, requestId: "0xabcd" }],
    ["a missing request id", { contract: CONTRACT }],
  ])("skips %s, reading nothing", async (_, data) => {
    const { run, deps } = rate({}, data);

    expect(await run).toEqual({ state: "skipped", reason: "bad-event" });
    expect(deps.readRequest).not.toHaveBeenCalled();
  });

  it("skips a contract that is not one of the environment's, reading nothing", async () => {
    const { run, deps } = rate({}, { ...EVENT, contract: `0x${"11".repeat(20)}` });

    expect(await run).toEqual({ state: "skipped", reason: "unknown-contract" });
    expect(deps.readRequest).not.toHaveBeenCalled();
  });

  it.each([
    ["fulfilled", pending({ status: "fulfilled", score: 72, rKaUal: R_KA })],
    ["cancelled", pending({ status: "cancelled", cancelReason: "expired" })],
    ["unknown", pending({ status: "none" })],
  ])("skips a request already %s, writing and scoring nothing", async (_, request) => {
    const { run, dkg, deps, oracleCalls } = rate({ requests: [request] });

    expect(await run).toEqual({ state: "skipped", reason: "not-pending" });
    expect(dkg.readAsset).not.toHaveBeenCalled();
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([]);
  });

  it("skips a contract whose oracle is not this deployment's key, before spending anything", async () => {
    const { run, dkg, deps, oracleCalls } = rate({ oracle: `0x${"22".repeat(20)}` });

    expect(await run).toEqual({ state: "skipped", reason: "not-our-oracle" });
    expect(dkg.readAsset).not.toHaveBeenCalled();
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([]);
  });

  it("has the oracle cancel an invalid target, without scoring", async () => {
    const { run, deps, dkg, oracleCalls } = rate({
      requests: [
        pending({ targetUal: TARGET.replace(AGENT, AGENT.toUpperCase().replace("0X", "0x")) }),
      ],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(dkg.readAsset).not.toHaveBeenCalled();
  });

  it("cancels a paper another publisher minted invalid-target at once, reading nothing", async () => {
    const { run, deps, dkg, oracleCalls } = rate({
      requests: [pending({ targetUal: ELSEWHERE })],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(dkg.readAsset).not.toHaveBeenCalled();
  });

  it("cancels invalid-target a UAL our node answers is none of its published papers", async () => {
    const { run, deps, dkg, log, oracleCalls } = rate({ found: [{ ok: true, bindings: [] }] });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(dkg.readAsset).not.toHaveBeenCalled();
    expect(dkg.query).toHaveBeenCalledWith(publishedPaperQuery(GRAPH, TARGET));
    expect(log).toEqual(["read-request", "find-target", "check-graph", "oracle cancel", "notify"]);
    expect(deps.notify).toHaveBeenCalledExactlyOnceWith({
      level: "activity",
      text: "⚠️ Rating cancelled: can't be rated",
      title: TARGET,
    });
  });

  it("never cancels on an empty answer from a node that no longer serves the graph", async () => {
    const { run, oracleCalls, dkg } = rate({
      found: [{ ok: true, bindings: [] }],
      graph: [{ ok: false, reason: "graph-not-served" }],
    });

    await expect(run).rejects.toThrow(/^rating-failed:setup: .*graph-not-served/);
    expect(oracleCalls).toEqual([]);
    expect(dkg.readAsset).not.toHaveBeenCalled();
  });

  it("fails setup before reading the R-KA when the node refuses the published-paper query", async () => {
    const { run, oracleCalls, dkg } = rate({ found: [{ ok: false, reason: "unauthorized" }] });

    await expect(run).rejects.toThrow(/^rating-failed:setup: /);
    expect(oracleCalls).toEqual([]);
    expect(dkg.readAsset).not.toHaveBeenCalled();
  });

  it("cancels invalid-target, not expired, a request past 24 hours for no published paper", async () => {
    const { run, oracleCalls } = rate({
      requests: [pending({ requestedAt: OLD })],
      found: [{ ok: true, bindings: [] }],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
  });

  it("retries, never cancels, when the node does not answer whether it published the paper", async () => {
    const { run, oracleCalls, log } = rate({
      found: [unreachable, { ok: true, bindings: [{ ka: TARGET }] }],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(oracleCalls.map((input) => input.action.kind)).toEqual(["fulfil"]);
    expect(log.slice(0, 4)).toEqual([
      "read-request",
      "find-target",
      "sleep find-target-retry-1 2m",
      "find-target-2",
    ]);
  });

  it("fails node-unreachable, leaving the request pending, when the node never answers", async () => {
    const { run, oracleCalls, log } = rate({ found: [unreachable] });

    await expect(run).rejects.toThrow(/^rating-failed:node-unreachable: /);
    expect(oracleCalls).toEqual([]);
    expect(log).toContain(`find-target-${RATING_SETTINGS.lookupAttempts}`);
  });
});

describe("runRating: rating a paper", () => {
  it("reads the paper, scores it once, stores, mints and fulfils with the score read back", async () => {
    const { run, deps, dkg, log, oracleCalls } = rate({
      ratingRows: [{ ok: true, bindings: ratingRows(64) }],
    });

    expect(await run).toEqual({ state: "fulfilled", score: 64, rKaUal: R_KA });
    expect(log).toEqual([
      "read-request",
      "find-target",
      "read-rka-1",
      "find-pdf-1",
      "read-paper-1",
      "check-field-1",
      "score-paper-1",
      "store-1",
      "mint-1",
      "read-score-1",
      "oracle fulfil",
      "notify",
    ]);
    expect(deps.notify).toHaveBeenCalledExactlyOnceWith({
      level: "activity",
      text: "⭐ Rated 64/100",
      title: "A trial",
      link: { label: "Open the rating", url: `${SITE}/papers/${CID}/ratings/${REQUEST_ID}` },
    });
    expect(dkg.query).toHaveBeenCalledWith(paperPdfQuery(GRAPH, TARGET));
    expect(deps.readPaper).toHaveBeenCalledExactlyOnceWith(CID);
    expect(deps.checkField).toHaveBeenCalledExactlyOnceWith({
      title: "A trial",
      abstract: "Sixty patients.",
      opening: PAPER.text.slice(0, PUBLISH_SETTINGS.openingChars),
    });
    expect(deps.score).toHaveBeenCalledExactlyOnceWith(PAPER);
    expect(dkg.storeAsset).toHaveBeenCalledWith(
      NAME,
      rKaQuads({
        requestId: REQUEST_ID,
        targetUal: TARGET,
        contract: `eip155:31337:${CONTRACT}`,
        output: OUTPUT,
        model: MODEL,
        promptVersion: SCORER_PROMPT_VERSION,
        textShortened: false,
      }),
    );
    expect(dkg.startMint).toHaveBeenCalledWith(NAME, { listenMs: RATING_SETTINGS.listenMs });
    expect(oracleCalls).toEqual([fulfil(64)]);
  });

  it("records in the R-KA that a paper's text was shortened to fit", async () => {
    const { run, dkg } = rate({ papers: [{ ok: true, paper: { ...PAPER, shortened: true } }] });

    await run;
    expect(dkg.storeAsset).toHaveBeenCalledWith(
      NAME,
      expect.arrayContaining([
        {
          subject: `urn:verisci:rating:${REQUEST_ID}/phase/1`,
          predicate: "urn:verisci:textShortened",
          object: '"true"^^<http://www.w3.org/2001/XMLSchema#boolean>',
        },
      ]),
    );
  });

  it("cancels invalid-target a paper the Flash-Lite field check reads as outside, never scoring", async () => {
    const { run, deps, dkg, log, oracleCalls } = rate({
      fields: [{ ok: true, field: "outside", reason: "Machine translation.", model: LITE }],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(deps.score).not.toHaveBeenCalled();
    expect(dkg.storeAsset).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
    expect(log.slice(-3)).toEqual(["check-field-1", "oracle cancel", "notify"]);
  });

  it.each([
    ["doesn't answer", { ok: false, reason: "unreachable", status: 503 } as const],
    ["gives an answer it can't use", { ok: false, reason: "invalid-output" } as const],
  ])(
    "goes on to the scorer, which decides the field, when the field check %s",
    async (_, failure) => {
      const { run, deps } = rate({ fields: [failure] });

      expect(await run).toMatchObject({ state: "fulfilled" });
      expect(deps.checkField).toHaveBeenCalledOnce();
      expect(deps.score).toHaveBeenCalledOnce();
    },
  );

  it("checks the field once a run, even when scoring is tried again", async () => {
    const { run, deps } = rate({
      scores: [
        { ok: false, reason: "unreachable", status: 503 },
        { ok: true, field: "life-sciences", output: OUTPUT, model: MODEL },
      ],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(deps.checkField).toHaveBeenCalledOnce();
  });

  it("cancels invalid-target a paper outside the field, storing nothing", async () => {
    const { run, dkg, log, oracleCalls } = rate({
      scores: [{ ok: true, field: "outside", reason: "Machine translation.", model: MODEL }],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
    expect(dkg.storeAsset).not.toHaveBeenCalled();
    expect(log.slice(-3)).toEqual(["score-paper-1", "oracle cancel", "notify"]);
  });

  it("cancels invalid-target a paper whose PDF holds no text, such as a scan, scoring nothing", async () => {
    const { run, deps, dkg, oracleCalls } = rate({ papers: [{ ok: false, reason: "no-text" }] });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
    expect(deps.score).not.toHaveBeenCalled();
    expect(dkg.storeAsset).not.toHaveBeenCalled();
  });

  it.each([
    ["a link that is not ipfs://", [{ url: `https://example.org/${CID}.pdf` }]],
    ["an invalid CID", [{ url: "ipfs://not-a-cid" }]],
  ])(
    "cancels invalid-target a paper whose PDF link is %s, reading nothing",
    async (_, bindings) => {
      const { run, deps, oracleCalls } = rate({ pdfRows: [{ ok: true, bindings }] });

      expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
      expect(oracleCalls).toEqual([cancel("invalid-target")]);
      expect(deps.readPaper).not.toHaveBeenCalled();
    },
  );

  it("asks again, never cancelling, when the node gives no PDF link for the paper it listed", async () => {
    const { run, log, oracleCalls } = rate({
      pdfRows: [
        { ok: true, bindings: [] },
        { ok: true, bindings: [{ url: `ipfs://${CID}` }] },
      ],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(log).toContain("sleep retry-1 2m");
    expect(log).toContain("find-pdf-2");
    expect(oracleCalls).toEqual([fulfil(72)]);
  });

  it("fulfils an R-KA already minted with its score read back, never scoring", async () => {
    const { run, deps, log, oracleCalls } = rate({ reads: [minted] });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(log).toEqual([
      "read-request",
      "find-target",
      "read-rka-1",
      "read-score-1",
      "oracle fulfil",
      "find-paper",
      "notify",
    ]);
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([fulfil(72)]);
  });

  it("looks the paper up for its message when the run never read it, so the message names it and links its rating", async () => {
    const { run, deps } = rate({ reads: [minted] });

    await run;

    expect(deps.notify.mock.calls[0]?.[0]).toMatchObject({
      title: "A trial",
      link: { label: "Open the rating", url: `${SITE}/papers/${CID}/ratings/${REQUEST_ID}` },
    });
  });

  it("names the paper by its UAL, with no link, when the node doesn't answer that look-up", async () => {
    const { run, deps } = rate({ reads: [minted], pdfRows: [unreachable] });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(deps.notify.mock.calls[0]?.[0]).toEqual({
      level: "activity",
      text: "⭐ Rated 72/100",
      title: TARGET,
    });
  });

  it("mints an R-KA already stored at once, polls every 30 s, then fulfils, never scoring", async () => {
    const { run, deps, dkg, log } = rate({
      reads: [stored, stored, minted],
      mints: [minting],
    });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(log).toEqual([
      "read-request",
      "find-target",
      "read-rka-1",
      "mint-1",
      "sleep wait-1-1 30s",
      "poll-1-1",
      "sleep wait-1-2 30s",
      "poll-1-2",
      "read-score-1",
      "oracle fulfil",
      "find-paper",
      "notify",
    ]);
    expect(dkg.storeAsset).not.toHaveBeenCalled();
    expect(deps.readPaper).not.toHaveBeenCalled();
  });

  it("shares a draft R-KA, mints it and fulfils, never scoring", async () => {
    const { run, deps, dkg } = rate({ reads: [draft] });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(dkg.storeAsset).toHaveBeenCalledWith(NAME, []);
    expect(deps.readPaper).not.toHaveBeenCalled();
  });

  it("names the R-KA as an orphan when the request was cancelled meanwhile, and alerts on it from a step of its own", async () => {
    const { run, logger, deps, log } = rate({
      oracleAnswer: () => ({ state: "cancelled", reason: "expired" }),
    });

    expect(await run).toEqual({ state: "cancelled", reason: "expired", orphan: R_KA });
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^rating-orphan: /));
    expect(deps.notify.mock.calls.map(([notice]) => notice.level)).toEqual(["alert", "activity"]);
    expect(deps.notify.mock.calls[0]?.[0].text).toMatch(new RegExp(`^rating-orphan: ${R_KA}`));
    expect(log.slice(-2)).toEqual(["alert-orphan", "notify"]);
  });

  it("alerts on the minted R-KA as an orphan, with no activity message, when the oracle finds the request gone", async () => {
    const gone = rate({ oracleAnswer: () => ({ state: "unknown" }) });

    expect(await gone.run).toEqual({ state: "skipped", reason: "not-pending", orphan: R_KA });
    expect(gone.log.slice(-1)).toEqual(["alert-orphan"]);
    expect(gone.deps.notify.mock.calls.map(([notice]) => notice.level)).toEqual(["alert"]);
    expect(gone.deps.notify.mock.calls[0]?.[0].text).toBe(
      `rating-orphan: ${R_KA} was written for a request no longer pending`,
    );
    expect(gone.logger.error).toHaveBeenCalledWith(expect.stringMatching(/^rating-orphan: /));
  });

  it("alerts that the minted R-KA may go unrecorded when the contract's oracle changed, without calling it an orphan", async () => {
    const changed = rate({ oracleAnswer: () => ({ state: "not-our-oracle" }) });
    const text = `rating-oracle-moved: ${R_KA} was minted for request ${REQUEST_ID}, but the contract's oracle is no longer this deployment's key; a later run records it once the deployment holds that key again, unless the request is cancelled by hand meanwhile`;

    expect(await changed.run).toEqual({
      state: "skipped",
      reason: "not-our-oracle",
      rKaUal: R_KA,
    });
    expect(changed.log.slice(-1)).toEqual(["alert-oracle-moved"]);
    expect(changed.deps.notify.mock.calls).toEqual([[{ level: "alert", text }]]);
    expect(changed.logger.error).toHaveBeenCalledWith(text);
  });

  it("skips with no message when the oracle can't record a cancel that left no R-KA", async () => {
    const { run, deps } = rate({
      requests: [pending({ targetUal: ELSEWHERE })],
      oracleAnswer: () => ({ state: "not-our-oracle" }),
    });

    expect(await run).toEqual({ state: "skipped", reason: "not-our-oracle" });
    expect(deps.notify).not.toHaveBeenCalled();
  });
});

describe("runRating: past the maximum age", () => {
  const old = pending({ requestedAt: OLD });

  it("fulfils a minted R-KA", async () => {
    const { run, oracleCalls } = rate({ requests: [old], reads: [minted] });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(oracleCalls).toEqual([fulfil(72)]);
  });

  it("polls a stored R-KA without minting it, and fulfils once it is minted", async () => {
    const { run, dkg } = rate({ requests: [old], reads: [stored, minted] });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(dkg.startMint).not.toHaveBeenCalled();
  });

  it("says a stored R-KA is recorded only if its mint landed when the contract's oracle changed before the expired cancel", async () => {
    const { run, deps, logger } = rate({
      requests: [old],
      reads: [stored],
      oracleAnswer: () => ({ state: "not-our-oracle" }),
    });
    const text = `rating-oracle-moved: ${R_KA} was stored, never minted, for request ${REQUEST_ID}, past its maximum age, but the contract's oracle is no longer this deployment's key; a later run under that key records it only if its mint landed, and otherwise cancels the request expired, leaving it unrecorded`;

    expect(await run).toEqual({ state: "skipped", reason: "not-our-oracle", rKaUal: R_KA });
    expect(deps.notify.mock.calls).toEqual([[{ level: "alert", text }]]);
    expect(logger.error).toHaveBeenCalledWith(text);
  });

  it("cancels it expired when the stored R-KA is never minted, naming it as an orphan", async () => {
    const { run, dkg, log, oracleCalls, logger } = rate({ requests: [old], reads: [stored] });

    expect(await run).toEqual({ state: "cancelled", reason: "expired", orphan: R_KA });
    expect(dkg.startMint).not.toHaveBeenCalled();
    expect(log).toContain(`poll-1-${RATING_SETTINGS.pollsPerMint}`);
    expect(oracleCalls).toEqual([cancel("expired")]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^rating-orphan: /));
  });

  it.each([
    ["nothing stored", missing],
    ["a draft", draft],
  ])("cancels it expired with %s, scoring nothing", async (_, read) => {
    const { run, deps, oracleCalls } = rate({ requests: [old], reads: [read] });

    expect(await run).toEqual({ state: "cancelled", reason: "expired" });
    expect(deps.readPaper).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([cancel("expired")]);
  });

  it("still scores a request exactly 24 hours old, and expires one a second older", async () => {
    const atLimit = rate({ requests: [pending({ requestedAt: NOW / 1000 - 24 * 3600 })] });
    expect(await atLimit.run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(atLimit.deps.score).toHaveBeenCalledOnce();

    const past = rate({ requests: [pending({ requestedAt: NOW / 1000 - 24 * 3600 - 1 })] });
    expect(await past.run).toEqual({ state: "cancelled", reason: "expired" });
    expect(past.deps.readPaper).not.toHaveBeenCalled();
  });
});

describe("runRating: retries", () => {
  it("waits 2 minutes and asks for the PDF's link again when the node does not answer", async () => {
    const { run, log } = rate({
      pdfRows: [unreachable, { ok: true, bindings: [{ url: `ipfs://${CID}` }] }],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(log).toContain("sleep retry-1 2m");
    expect(log).toContain("find-pdf-2");
  });

  it("reads the PDF again 15 s later, in the same attempt, when the gateway fails the first read", async () => {
    const { run, deps, log } = rate({ papers: [gatewayDown, { ok: true, paper: PAPER }] });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(log.slice(4, 8)).toEqual([
      "read-paper-1",
      "sleep read-paper-1-wait 15s",
      "read-paper-1-again",
      "check-field-1",
    ]);
    expect(log).not.toContain("sleep retry-1 2m");
    expect(deps.readPaper).toHaveBeenCalledTimes(2);
  });

  it("waits 2 minutes and reads the PDF again when the second read fails too", async () => {
    const { run, deps, log } = rate({
      papers: [gatewayDown, gatewayDown, { ok: true, paper: PAPER }],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(log).toContain("sleep retry-1 2m");
    expect(log).toContain("read-paper-2");
    expect(log).not.toContain("find-pdf-2");
    expect(deps.readPaper).toHaveBeenCalledTimes(3);
  });

  it("fails paper-unreachable, naming why, with no cancel, when the PDF never comes", async () => {
    const { run, deps, oracleCalls } = rate({ papers: [gatewayDown] });

    await expect(run).rejects.toThrow(
      /^rating-failed:paper-unreachable: .*did not come \(HTTP 504\)/,
    );
    expect(deps.readPaper).toHaveBeenCalledTimes(RATING_SETTINGS.attempts + 1);
    expect(oracleCalls).toEqual([]);
  });

  it("fails node-unreachable, with no cancel, when the node never gives the PDF link", async () => {
    const { run, oracleCalls } = rate({ pdfRows: [{ ok: true, bindings: [] }] });

    await expect(run).rejects.toThrow(/^rating-failed:node-unreachable: /);
    expect(oracleCalls).toEqual([]);
  });

  it("cancels invalid-target a PDF that reads badly 4 times, over at least 22 minutes, scoring nothing", async () => {
    const { run, deps, dkg, oracleCalls, log } = rate({
      papers: [{ ok: false, reason: "unreadable" }],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(RATING_SETTINGS.unreadableReads).toBe(4);
    expect(deps.readPaper).toHaveBeenCalledTimes(4);
    expect(log.filter((entry) => entry.startsWith("sleep retry-"))).toEqual([
      "sleep retry-1 2m",
      "sleep retry-2 5m",
      "sleep retry-3 15m",
    ]);
    expect(deps.score).not.toHaveBeenCalled();
    expect(dkg.storeAsset).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
  });

  it("fails paper-unreadable, with no cancel, when the attempts run out before 4 bad reads", async () => {
    const { run, deps, oracleCalls } = rate({
      papers: [
        ...Array.from({ length: RATING_SETTINGS.attempts }, () => gatewayDown),
        { ok: false, reason: "unreadable" },
      ],
    });

    await expect(run).rejects.toThrow(/^rating-failed:paper-unreadable: /);
    expect(deps.readPaper).toHaveBeenCalledTimes(RATING_SETTINGS.attempts + 1);
    expect(oracleCalls).toEqual([]);
  });

  it("scores a PDF that reads on a later attempt after not reading as one", async () => {
    const { run, deps } = rate({
      papers: [
        { ok: false, reason: "unreadable" },
        { ok: true, paper: PAPER },
      ],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(deps.readPaper).toHaveBeenCalledTimes(2);
  });

  it("cancels invalid-target at once a PDF over the size limit, reading it once", async () => {
    const { run, deps, dkg, oracleCalls } = rate({ papers: [{ ok: false, reason: "too-large" }] });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(deps.readPaper).toHaveBeenCalledTimes(1);
    expect(deps.score).not.toHaveBeenCalled();
    expect(dkg.storeAsset).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
  });

  it("cancels invalid-target after two answers the check refuses, storing nothing", async () => {
    const { run, deps, dkg, oracleCalls } = rate({
      scores: [{ ok: false, reason: "invalid-output" }],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(deps.score).toHaveBeenCalledTimes(RATING_SETTINGS.unusableAnswers);
    expect(dkg.storeAsset).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
  });

  it("scores after one answer the check refuses when the next one is usable", async () => {
    const { run, deps } = rate({
      scores: [
        { ok: false, reason: "invalid-output" },
        { ok: true, field: "life-sciences", output: OUTPUT, model: MODEL },
      ],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(deps.score).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["unreachable", { ok: false, reason: "unreachable" } as const],
    ["rate-limited", { ok: false, reason: "rate-limited" } as const],
  ])("retries a scorer that is %s, then fails scorer-unavailable", async (_, failure) => {
    const { run, deps } = rate({ scores: [failure] });

    await expect(run).rejects.toThrow(/^rating-failed:scorer-unavailable: /);
    expect(deps.score).toHaveBeenCalledTimes(RATING_SETTINGS.attempts);
    expect(deps.readPaper).toHaveBeenCalledOnce();
  });

  it("waits 2, 5, 15, 30 and 60 minutes between its 6 attempts while Gemini stays down", async () => {
    const { run, deps, log } = rate({
      scores: [{ ok: false, reason: "unreachable", status: 503 }],
    });

    await expect(run).rejects.toThrow(/^rating-failed:scorer-unavailable: /);
    expect(deps.score).toHaveBeenCalledTimes(6);
    expect(log.filter((entry) => entry.startsWith("sleep retry-"))).toEqual([
      "sleep retry-1 2m",
      "sleep retry-2 5m",
      "sleep retry-3 15m",
      "sleep retry-4 30m",
      "sleep retry-5 60m",
    ]);
  });

  it("names Gemini's status when the scorer stays unavailable", async () => {
    const { run } = rate({ scores: [{ ok: false, reason: "unreachable", status: 503 }] });

    await expect(run).rejects.toThrow(/scorer unreachable \(HTTP 503\)/);
  });

  it("scores again after a failed score, reading the paper only once", async () => {
    const { run, deps, log } = rate({
      scores: [
        { ok: false, reason: "rate-limited", status: 429 },
        { ok: true, field: "life-sciences", output: OUTPUT, model: MODEL },
      ],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(deps.score).toHaveBeenCalledTimes(2);
    expect(deps.readPaper).toHaveBeenCalledOnce();
    expect(log).toContain("score-paper-2");
    expect(log).not.toContain("find-pdf-2");
    expect(log).not.toContain("read-paper-2");
  });

  it("never scores again once a score came back, even when the store fails", async () => {
    const { run, deps, dkg, log } = rate({
      reads: [missing, missing],
      stores: [unreachable, stored],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(deps.readPaper).toHaveBeenCalledOnce();
    expect(deps.score).toHaveBeenCalledOnce();
    expect(dkg.storeAsset).toHaveBeenCalledTimes(2);
    expect(log).toContain("store-2");
    expect(log).not.toContain("score-paper-2");
  });

  it("retries a node that does not answer, then fails node-unreachable", async () => {
    const { run, dkg } = rate({ reads: [unreachable] });

    await expect(run).rejects.toThrow(/^rating-failed:node-unreachable: /);
    expect(dkg.readAsset).toHaveBeenCalledTimes(RATING_SETTINGS.attempts);
  });

  it("waits 2 minutes after a quorum failure on the mint", async () => {
    const { run, log } = rate({
      reads: [stored, stored],
      mints: [{ ok: false, reason: "retry-later" }, mintedNow],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(log).toContain("sleep retry-1 2m");
  });

  it("starts the mint again, with no wait, when it is not seen after 10 minutes", async () => {
    const { run, dkg, log } = rate({
      reads: [
        stored,
        ...Array.from({ length: RATING_SETTINGS.pollsPerMint }, () => stored),
        stored,
      ],
      mints: [minting, mintedNow],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(dkg.startMint).toHaveBeenCalledTimes(2);
    expect(log).not.toContain("sleep retry-1 2m");
    expect(log).toContain("mint-2");
  });

  it("retries a minted R-KA the node returns no rows for yet", async () => {
    const { run, log } = rate({
      reads: [minted],
      ratingRows: [
        { ok: true, bindings: [] },
        { ok: true, bindings: ratingRows(72) },
      ],
    });

    expect(await run).toMatchObject({ state: "fulfilled", score: 72 });
    expect(log).toContain("read-score-2");
  });

  it("retries a chain that does not answer, then fails chain-unreachable", async () => {
    const { run, deps, log } = rate({ requests: [unreachable] });

    await expect(run).rejects.toThrow(/^rating-failed:chain-unreachable: /);
    expect(deps.readRequest).toHaveBeenCalledTimes(RATING_SETTINGS.lookupAttempts);
    expect(log).toContain("read-request-5");
  });
});

describe("runRating: failures that stop the run at once", () => {
  it.each([
    [
      "the node refuses our credential",
      { reads: [{ ok: false, reason: "unauthorized" } as const] },
    ],
    [
      "the node does not serve the graph",
      { reads: [{ ok: false, reason: "graph-not-served" } as const] },
    ],
    [
      "Gemini refuses the request",
      { scores: [{ ok: false, reason: "refused", status: 403 } as const] },
    ],
  ])("fails setup when %s", async (_, script) => {
    const { run } = rate(script);

    await expect(run).rejects.toThrow(NonRetriableError);
    await expect(run).rejects.toThrow(/^rating-failed:setup: /);
  });

  it("names Gemini's status when it refuses the request, so a retired model reads as one", async () => {
    const { run } = rate({ scores: [{ ok: false, reason: "refused", status: 404 }] });

    await expect(run).rejects.toThrow(/Gemini refused the request \(HTTP 404\)/);
  });

  it("fails rating-unreadable when a minted R-KA's score cannot be read back", async () => {
    const { run, oracleCalls } = rate({
      reads: [minted],
      ratingRows: [{ ok: true, bindings: [{ s: "x", p: "y", o: "z" }] }],
    });

    await expect(run).rejects.toThrow(/^rating-failed:rating-unreadable: /);
    expect(oracleCalls).toEqual([]);
  });

  it("fails oracle-failed when the oracle function fails", async () => {
    const { run } = rate({
      oracleAnswer: () => {
        throw new Error("oracle-failed:oracle-stuck: nothing settled in time");
      },
    });

    await expect(run).rejects.toThrow(/^rating-failed:oracle-failed: /);
  });
});

describe("ratingFailureReason", () => {
  it("finds the reason a failed run's error carries, wherever Inngest nests it", () => {
    const error = { name: "NonRetriableError", message: "rating-failed:scorer-unavailable: x" };

    expect(ratingFailureReason(error)).toBe("scorer-unavailable");
    expect(ratingFailureReason({ error })).toBe("scorer-unavailable");
    expect(ratingFailureReason(JSON.stringify([{ op: "StepFailed", error }]))).toBe(
      "scorer-unavailable",
    );
  });

  it("finds none in an error that carries no known reason", () => {
    expect(ratingFailureReason({ message: "rating-failed:odd: x" })).toBeUndefined();
    expect(ratingFailureReason(undefined)).toBeUndefined();
  });
});

describe("loadRatingDeps", () => {
  it("stops the run without retries when the settings are missing or invalid", () => {
    const load = () =>
      loadRatingDeps(() => {
        throw new Error("Invalid environment variables:\n  GEMINI_API_KEY: Required");
      });

    expect(load).toThrow(NonRetriableError);
    expect(load).toThrow(/^rating-failed:setup: .*GEMINI_API_KEY/s);
  });
});

describe("createRatePaper", () => {
  const inngest = new Inngest({ id: "labstrail-test" });
  const oracleFn = inngest.createFunction({ id: "oracle-transaction" }, async () => null);
  const build = (throttle: boolean) =>
    createRatePaper(inngest, () => rate({}).deps, oracleFn, { throttle });

  it("runs on labstrail/rating.requested as a singleton per request id, skipping new runs", () => {
    const fn = build(true);

    expect(fn.opts.id).toBe("rate-paper");
    expect(fn.opts.triggers).toEqual([{ event: "labstrail/rating.requested" }]);
    expect(fn.opts.singleton).toEqual({ key: "event.data.requestId", mode: "skip" });
    expect(fn.opts.timeouts).toEqual({ finish: "300m" });
  });

  it("keeps the maximum age above the reconciler's threshold and interval plus a run's budget", () => {
    const budgetMs = Number.parseInt(RATING_SETTINGS.finishTimeout, 10) * 60_000;

    expect(RATING_SETTINGS.maxAgeMs).toBeGreaterThan(
      RECONCILER_SETTINGS.thresholdMs + RECONCILER_SETTINGS.intervalMs + budgetMs,
    );
  });

  it("throttles to 3 starts an hour in a deployment, and not locally", () => {
    expect(build(true).opts.throttle).toEqual({ limit: 3, period: "1h", burst: 3 });
    expect(build(false).opts.throttle).toBeUndefined();
  });
});
