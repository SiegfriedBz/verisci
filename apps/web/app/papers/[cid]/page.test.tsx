import { cleanup, render, screen } from "@testing-library/react";
import { Suspense, use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaperView } from "../../../lib/publish/upload-actions.ts";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";
const CHROME =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
/** Whether the mocked read has answered, or is still waiting on the node. */
let readArrives = true;
let userAgent: string | null = CHROME;
const never = new Promise<never>(() => {});
const readProgressOnce = vi.fn<(cid: string, eventId: string | undefined) => Promise<PaperView>>();

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(userAgent === null ? {} : { "user-agent": userAgent }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@labstrail/workflows", () => ({ getUploadService: () => ({}) }));
vi.mock("../../../lib/publish/upload-actions.ts", () => ({
  readProgressOnce: (cid: string, eventId: string | undefined) => readProgressOnce(cid, eventId),
}));
vi.mock("../../../components/paper/paper-loader.tsx", () => ({
  PaperLoader: (props: {
    cid: string;
    eventId?: string;
    resubmitted: boolean;
    blocking?: boolean;
  }) => {
    if (!readArrives) use(never);
    return <p>Paper {JSON.stringify(props)}</p>;
  },
}));

const { default: PaperPage, generateMetadata } = await import("./page.tsx");

const page = (cid: string, search: Record<string, string | string[]> = {}) =>
  PaperPage({ params: Promise.resolve({ cid }), searchParams: Promise.resolve(search) });

async function show(search: Record<string, string | string[]> = {}) {
  render(await page(CID, search));
}

describe("/papers/[cid]", () => {
  afterEach(() => {
    cleanup();
    readArrives = true;
    userAgent = CHROME;
    readProgressOnce.mockReset();
  });

  it("reads the paper with the event and the resubmitted flag from the address", async () => {
    await show({ event: "01K7C2M4X8Q9R1S2T3V4W5Y6Z7", already: "1" });

    expect(
      screen.getByText(
        `Paper ${JSON.stringify({ cid: CID, eventId: "01K7C2M4X8Q9R1S2T3V4W5Y6Z7", resubmitted: true, blocking: false })}`,
      ),
    ).toBeTruthy();
  });

  it("ignores a repeated event", async () => {
    await show({ event: ["a", "b"] });

    expect(
      screen.getByText(
        `Paper ${JSON.stringify({ cid: CID, resubmitted: false, blocking: false })}`,
      ),
    ).toBeTruthy();
  });

  it("shows a skeleton of the paper until the node answers", async () => {
    readArrives = false;

    await show();

    expect(screen.getByRole("status", { name: "Loading paper" })).toBeTruthy();
    expect(screen.queryByText(/^Paper /)).toBeNull();
  });

  it("answers 404 for an address that is no CID, before anything streams", async () => {
    await expect(page("notacid")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the paper in place for a crawler that runs no JavaScript, with no skeleton", async () => {
    userAgent = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0";

    const element = await page(CID);

    expect(element.type).not.toBe(Suspense);
    render(element);
    expect(
      screen.getByText(`Paper ${JSON.stringify({ cid: CID, resubmitted: false, blocking: true })}`),
    ).toBeTruthy();
  });

  it("keeps streaming for a browser, and for a request with no user agent", async () => {
    userAgent = null;

    expect((await page(CID)).type).toBe(Suspense);
  });
});

describe("/papers/[cid] metadata", () => {
  afterEach(() => readProgressOnce.mockReset());

  const metadata = (search: Record<string, string> = {}) =>
    generateMetadata({
      params: Promise.resolve({ cid: CID }),
      searchParams: Promise.resolve(search),
    });

  it("titles a published paper after itself, from the read the page shares", async () => {
    readProgressOnce.mockResolvedValue({
      stage: "published",
      ual: UAL,
      record: {
        title: "Screening VP1 of deformed wing virus",
        authors: ["Di Liu"],
        pdf: `ipfs://${CID}`,
        submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
        signature: "0xefa5",
        deadline: "1791639162",
        signatureCheck: "valid",
        publisher: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
      },
    });

    expect(await metadata({ event: "01K7C2M4X8Q9R1S2T3V4W5Y6Z7" })).toMatchObject({
      title: "Screening VP1 of deformed wing virus",
      alternates: { canonical: `/papers/${CID}` },
    });
    expect(readProgressOnce).toHaveBeenCalledWith(CID, "01K7C2M4X8Q9R1S2T3V4W5Y6Z7");
  });

  it("answers 404 when the node has no such paper", async () => {
    readProgressOnce.mockResolvedValue({ stage: "not-found" });

    await expect(metadata()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("keeps a paper on its way out of search results", async () => {
    readProgressOnce.mockResolvedValue({ stage: "minting" });

    expect(await metadata()).toMatchObject({ robots: { index: false } });
  });
});
