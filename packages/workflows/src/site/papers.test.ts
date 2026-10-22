import { submissionTypedData } from "@labstrail/core";
import type { DkgFailure, QueryResult } from "@labstrail/dkg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSignature, listPapers, type PaperListDeps } from "./papers.ts";

const GRAPH = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging";
const FIRST = "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m";
const SECOND = "bafybeihhkeyxcad3cuj42gvhpsh67tiagkwfxbjgjsx7m3tidbkknkifcy";
const DEADLINE = 1_791_645_808n;
const INTEGER = "^^<http://www.w3.org/2001/XMLSchema#integer>";
const signer = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

/** A page row as the node answers it, signed by `by` over this graph. */
async function pageRow(cid: string, n: number, by = signer, authorCount = cid === FIRST ? 10 : 0) {
  const signature = await by.signTypedData(
    submissionTypedData({ cid, contextGraph: GRAPH, deadline: DEADLINE }),
  );
  return {
    paper: `urn:verisci:paper:${cid}`,
    ual: `did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/${n}`,
    publishedAt: `"2026-10-10T1${n}:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>`,
    title: `"Paper ${n}"`,
    submitter: `"${signer.address.toLowerCase()}"`,
    signature: `"${signature}"`,
    deadline: `"${DEADLINE}"${INTEGER}`,
    authorCount: `"${authorCount}"${INTEGER}`,
  };
}

const authorRows = ["Alexander W Bruce", "Rebecca Collier", "Martina Bohuslavová"].map(
  (name, index) => ({
    paper: `urn:verisci:paper:${FIRST}`,
    authorName: `"${name}"`,
    authorPosition: `"${index + 1}"${INTEGER}`,
  }),
);

type Answer = QueryResult | (() => Promise<QueryResult>);

/** A node answering each of the three queries, recording what it was asked. */
function node(answers: { page: Answer; count: Answer; authors?: Answer }) {
  const asked: string[] = [];
  const query = async (sparql: string): Promise<QueryResult> => {
    asked.push(sparql);
    const answer = sparql.startsWith("SELECT (COUNT")
      ? answers.count
      : sparql.includes("VALUES (?paper ?g)")
        ? (answers.authors ?? rows(authorRows))
        : answers.page;
    return typeof answer === "function" ? answer() : answer;
  };
  return { query, asked };
}

function rows(bindings: readonly Record<string, string>[]): QueryResult {
  return { ok: true, bindings };
}

const total = (n: number) => rows([{ total: `"${n}"${INTEGER}` }]);
const chainUp: PaperListDeps["chain"] = {
  verifyTypedData: async () => false,
  getBlockNumber: async () => 1n,
};
const chainDown: PaperListDeps["chain"] = {
  verifyTypedData: async () => {
    throw new Error("down");
  },
  getBlockNumber: async () => {
    throw new Error("down");
  },
};

describe("listPapers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for the count and the page at once, then the page's first authors", async () => {
    let release = () => {};
    const bothAsked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const page = rows([await pageRow(FIRST, 9), await pageRow(SECOND, 8)]);
    const { query, asked } = node({
      page: async () => {
        await bothAsked;
        return page;
      },
      count: async () => {
        release();
        return total(5);
      },
    });

    const result = await listPapers(
      { page: 2, pageSize: 2 },
      { contextGraph: GRAPH, query, chain: chainUp },
    );

    expect(asked).toHaveLength(3);
    expect(asked[0]).toMatch(/LIMIT 2 OFFSET 2$/);
    expect(asked[1]).toMatch(/^SELECT \(COUNT/);
    expect(asked[2]).toContain(
      `(<urn:verisci:paper:${FIRST}> <did:dkg:context-graph:${GRAPH}/_verifiable_memory/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/9>)`,
    );
    expect(asked[2]).toContain(`<urn:verisci:paper:${SECOND}>`);
    expect(asked[2]).toContain("FILTER(?authorPosition <= 3)");
    expect(result).toEqual({
      ok: true,
      total: 5,
      papers: [
        {
          cid: FIRST,
          ual: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/9",
          publishedAt: "2026-10-10T19:00:00.000Z",
          title: "Paper 9",
          authors: ["Alexander W Bruce", "Rebecca Collier", "Martina Bohuslavová"],
          authorCount: 10,
          submitter: signer.address.toLowerCase(),
          signatureCheck: "valid",
        },
        {
          cid: SECOND,
          ual: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/8",
          publishedAt: "2026-10-10T18:00:00.000Z",
          title: "Paper 8",
          authors: [],
          authorCount: 0,
          submitter: signer.address.toLowerCase(),
          signatureCheck: "valid",
        },
      ],
    });
  });

  it("checks each paper's signature as the paper page does", async () => {
    const page = rows([await pageRow(FIRST, 9), await pageRow(SECOND, 8, stranger)]);

    const checks = async (chain: PaperListDeps["chain"]) => {
      const result = await listPapers(
        { page: 1, pageSize: 20 },
        { contextGraph: GRAPH, query: node({ page, count: total(2) }).query, chain },
      );
      return result.ok ? result.papers.map((paper) => paper.signatureCheck) : result;
    };

    expect(await checks(chainUp)).toEqual(["valid", "invalid"]);
    expect(await checks(chainDown)).toEqual(["valid", "unknown"]);
  });

  it("shows a signature as not checked when the chain takes more than 3 s to answer", async () => {
    const page = rows([await pageRow(FIRST, 9), await pageRow(SECOND, 8, stranger)]);
    const hanging: PaperListDeps["chain"] = {
      verifyTypedData: () => new Promise(() => {}),
      getBlockNumber: () => new Promise(() => {}),
    };
    vi.useFakeTimers();

    const listed = listPapers(
      { page: 1, pageSize: 20 },
      { contextGraph: GRAPH, query: node({ page, count: total(2) }).query, chain: hanging },
    );
    await vi.advanceTimersByTimeAsync(3000);
    const result = await listed;

    expect(result.ok ? result.papers.map((paper) => paper.signatureCheck) : result).toEqual([
      "valid",
      "unknown",
    ]);
  });

  it("says the list is unreadable when the node answers rows but none can be read", async () => {
    const { query, asked } = node({
      page: rows([{ paper: "urn:other:x", ual: "did:dkg:base:84532/0xnope/1" }]),
      count: total(5),
    });

    expect(
      await listPapers({ page: 1, pageSize: 20 }, { contextGraph: GRAPH, query, chain: chainUp }),
    ).toEqual({ ok: false, reason: "unreadable" });
    expect(asked).toHaveLength(2);
  });

  it("says the list is unreadable when a page the total covers comes back empty", async () => {
    const { query, asked } = node({ page: rows([]), count: total(5) });

    expect(
      await listPapers({ page: 1, pageSize: 20 }, { contextGraph: GRAPH, query, chain: chainUp }),
    ).toEqual({ ok: false, reason: "unreadable" });
    expect(asked).toHaveLength(2);
  });

  it("gives no papers, with the total, for a page past the last, and asks for no authors", async () => {
    const { query, asked } = node({ page: rows([]), count: total(5) });

    expect(
      await listPapers({ page: 4, pageSize: 2 }, { contextGraph: GRAPH, query, chain: chainUp }),
    ).toEqual({ ok: true, total: 5, papers: [] });
    expect(asked).toHaveLength(2);
  });

  const down: DkgFailure[] = [
    { ok: false, reason: "unreachable" },
    { ok: false, reason: "retry-later", status: 503 },
    { ok: false, reason: "unexpected", status: 429 },
    { ok: false, reason: "unexpected", status: 500 },
  ];
  const refused: DkgFailure[] = [
    { ok: false, reason: "unauthorized", status: 401 },
    { ok: false, reason: "unexpected", status: 400 },
    { ok: false, reason: "unexpected", status: 200 },
  ];

  it.each(["page", "count", "authors"] as const)(
    "says the list is unavailable when the node does not answer the %s query",
    async (failing) => {
      const page = rows([await pageRow(FIRST, 9)]);
      for (const failure of down) {
        const answers = { page, count: total(1), authors: rows(authorRows), [failing]: failure };
        const result = await listPapers(
          { page: 1, pageSize: 20 },
          { contextGraph: GRAPH, query: node(answers).query, chain: chainUp },
        );
        expect(result).toEqual({ ok: false, reason: "unavailable" });
      }
    },
  );

  it.each(["page", "count", "authors"] as const)(
    "says the list is unreadable when the node refuses the %s query",
    async (failing) => {
      const page = rows([await pageRow(FIRST, 9)]);
      for (const failure of refused) {
        const answers = { page, count: total(1), authors: rows(authorRows), [failing]: failure };
        const result = await listPapers(
          { page: 1, pageSize: 20 },
          { contextGraph: GRAPH, query: node(answers).query, chain: chainUp },
        );
        expect(result).toEqual({ ok: false, reason: "unreadable" });
      }
    },
  );

  it("says the list is unreadable when the count does not parse", async () => {
    const { query } = node({ page: rows([]), count: rows([{ total: '"many"' }]) });

    expect(
      await listPapers({ page: 1, pageSize: 20 }, { contextGraph: GRAPH, query, chain: chainUp }),
    ).toEqual({ ok: false, reason: "unreadable" });
  });

  it.each([
    { page: 0, pageSize: 20 },
    { page: 1.5, pageSize: 20 },
    { page: Number.NaN, pageSize: 20 },
    { page: 1, pageSize: 0 },
    { page: 1, pageSize: 51 },
    { page: 2 ** 52, pageSize: 50 },
  ])("throws a RangeError for page $page of $pageSize", async (options) => {
    const { query } = node({ page: rows([]), count: total(0) });

    await expect(
      listPapers(options, { contextGraph: GRAPH, query, chain: chainUp }),
    ).rejects.toThrow(RangeError);
  });
});

describe("checkSignature", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks one paper's signature, and answers unknown when the chain takes more than 3 s", async () => {
    const signed = async (by = signer) => ({
      cid: FIRST,
      contextGraph: GRAPH,
      deadline: DEADLINE,
      submitter: signer.address.toLowerCase(),
      signature: await by.signTypedData(
        submissionTypedData({ cid: FIRST, contextGraph: GRAPH, deadline: DEADLINE }),
      ),
    });
    expect(await checkSignature(await signed(), chainUp)).toBe("valid");
    expect(await checkSignature(await signed(stranger), chainUp)).toBe("invalid");

    const foreign = await signed(stranger);
    vi.useFakeTimers();
    const checked = checkSignature(foreign, {
      verifyTypedData: () => new Promise(() => {}),
      getBlockNumber: () => new Promise(() => {}),
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await checked).toBe("unknown");
  });
});
