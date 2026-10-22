import type { PaperStatus, PublishedRecord } from "@labstrail/workflows";
import { cleanup, render, screen } from "@testing-library/react";
import { isValidElement, type ReactNode, Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
const EVENT_ID = "01K7C2M4X8Q9R1S2T3V4W5Y6Z7";
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";
const readPaper = vi.fn<(cid: string, eventId?: string) => Promise<PaperStatus>>();

vi.mock("@labstrail/workflows", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@labstrail/workflows")>()),
  getUploadService: () => ({
    contextGraph: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-staging",
    readPaper,
  }),
}));

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../rating/ratings-section.tsx", () => ({
  RatingsSection: ({ ual, title }: { ual: string; title?: string }) => (
    <p>
      ratings of {ual} titled {title}
    </p>
  ),
}));

const { PaperLoader } = await import("./paper-loader.tsx");

const record: PublishedRecord = {
  title: "Screening VP1 of deformed wing virus",
  authors: ["Di Liu"],
  pdf: `ipfs://${CID}`,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signature: "0xefa5",
  deadline: "1791639162",
  signatureCheck: "valid",
  publisher: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
};

/** Whether a rendered tree holds a `Suspense` boundary. */
function streams(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(streams);
  if (!isValidElement(node)) return false;
  if (node.type === Suspense) return true;
  return streams((node.props as { children?: ReactNode }).children);
}

/** The structured data the page holds, parsed. */
function structuredData(): { "@graph"?: { "@type": string; "@id"?: string }[] }[] {
  return [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) =>
    JSON.parse(script.textContent ?? ""),
  );
}

describe("PaperLoader", () => {
  afterEach(() => {
    cleanup();
    readPaper.mockReset();
    vi.unstubAllGlobals();
  });

  it("reads the paper on the server and shows its record, with nothing left to ask", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    readPaper.mockResolvedValue({
      asset: { ok: true, state: "minted", ual: UAL },
      run: undefined,
      record,
    });

    render(await PaperLoader({ cid: CID, eventId: undefined, resubmitted: false }));

    expect(readPaper).toHaveBeenCalledWith(CID, undefined);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Screening VP1 of deformed wing virus",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText(`ratings of ${UAL} titled ${record.title}`)).toBeTruthy();
  });

  it("describes a published paper for search engines, as a ScholarlyArticle with its breadcrumb", async () => {
    readPaper.mockResolvedValue({
      asset: { ok: true, state: "minted", ual: UAL },
      run: undefined,
      record,
    });

    render(await PaperLoader({ cid: CID, eventId: undefined, resubmitted: false }));

    const [data] = structuredData();
    expect(data?.["@graph"]?.map((node) => node["@type"])).toEqual([
      "ScholarlyArticle",
      "BreadcrumbList",
    ]);
    expect(data?.["@graph"]?.[0]?.["@id"]).toBe(`http://localhost:3000/papers/${CID}#paper`);
  });

  it("streams the ratings in their own boundary, or renders them in place when blocking", async () => {
    readPaper.mockResolvedValue({
      asset: { ok: true, state: "minted", ual: UAL },
      run: undefined,
      record,
    });

    expect(streams(await PaperLoader({ cid: CID, eventId: undefined, resubmitted: false }))).toBe(
      true,
    );
    expect(
      streams(
        await PaperLoader({ cid: CID, eventId: undefined, resubmitted: false, blocking: true }),
      ),
    ).toBe(false);
  });

  it("asks about the run its event started", async () => {
    readPaper.mockResolvedValue({
      asset: { ok: true, state: "draft" },
      run: { ok: true, run: { state: "running" } },
    });

    render(await PaperLoader({ cid: CID, eventId: EVENT_ID, resubmitted: false }));

    expect(readPaper).toHaveBeenCalledWith(CID, EVENT_ID);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Saving the record");
    expect(screen.queryByText(/ratings of/)).toBeNull();
    expect(structuredData()).toEqual([]);
  });
});
