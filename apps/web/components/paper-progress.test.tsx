import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaperView } from "../lib/upload-actions.ts";
import { PaperProgress } from "./paper-progress.tsx";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
const GRAPH = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-staging";

/** Answers each poll with the next view, repeating the last one. */
function serve(views: PaperView[]) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      urls.push(input);
      return Response.json(views[Math.min(urls.length - 1, views.length - 1)]);
    }),
  );
  return urls;
}

/** Lets the pending poll settle, then moves the clock on. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("PaperProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks every 5 s with the event id until a final stage, then stops", async () => {
    const urls = serve([
      { stage: "reading" },
      { stage: "minting" },
      { stage: "refused", reason: "no-title" },
    ]);

    render(<PaperProgress cid={CID} contextGraph={GRAPH} eventId="01M4K5BC7RA0P4XR2YJQ6BNCJ9" />);
    await advance(0);
    expect(urls).toEqual([`/api/papers/${CID}?event=01M4K5BC7RA0P4XR2YJQ6BNCJ9`]);

    await advance(5000);
    await advance(5000);
    expect(urls).toHaveLength(3);
    expect(screen.getByRole("alert").textContent).toMatch(/title/);

    await advance(30_000);
    expect(urls).toHaveLength(3);
  });

  it("keeps asking while the answer cannot be read, and shows it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    const fetchMock = vi.mocked(globalThis.fetch);

    render(<PaperProgress cid={CID} contextGraph={GRAPH} eventId={undefined} />);
    await advance(0);
    await advance(5000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/can't reach the network/)).toBeTruthy();
  });

  it("shows and asks by the canonical CID, whatever spelling the address has", async () => {
    const urls = serve([{ stage: "minting" }]);
    const v0 = "QmPZ9gcCEpqKTo6aq61g2nXGUhM4iCL3ewB6LDXZCtioEB";

    render(<PaperProgress cid={v0} contextGraph={GRAPH} eventId={undefined} />);
    await advance(0);

    expect(urls[0]).toMatch(/^\/api\/papers\/bafy/);
    expect(screen.queryByText(v0)).toBeNull();
  });
});
