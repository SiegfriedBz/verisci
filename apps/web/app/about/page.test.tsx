import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SITE } from "../../lib/site.ts";
import AboutPage, { metadata } from "./page.tsx";

describe("/about", () => {
  afterEach(cleanup);

  it("says what LabsTrail is and who builds it, with the code and the maintainer's profile", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("About LabsTrail");
    expect(screen.getByText(SITE.definition)).toBeTruthy();
    expect(screen.getByText(/Siegfried Bozza/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /GitHub/ }).getAttribute("href")).toBe(SITE.repo);
    expect(screen.getByRole("link", { name: /LinkedIn/ }).getAttribute("href")).toBe(
      SITE.maintainer.linkedIn,
    );
  });

  it("says why LabsTrail exists: results that can't be repeated, and agents that can't tell", () => {
    render(<AboutPage />);

    const why = screen.getByRole("region", { name: "Why LabsTrail exists" });
    expect(why.textContent).toMatch(/more than 70% had tried and failed to reproduce/);
    expect(why.textContent).toMatch(/AI agents/);
    expect(why.textContent).toMatch(/provenance/);
    expect(why.textContent).toMatch(
      /machine reproducibility score first, then transparent human review/,
    );
  });

  it("explains the DKG's two layers and the PDF on IPFS", () => {
    render(<AboutPage />);

    const dkg = screen.getByRole("region", { name: "Built on the OriginTrail DKG" });
    for (const layer of [
      "The graph, off-chain",
      "The proof, on-chain",
      "The paper itself, on IPFS",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: layer })).toBeTruthy();
    }
    expect(dkg.textContent).toMatch(/merkle root/);
    expect(dkg.textContent).toMatch(/decentralized storage network/);
    expect(dkg.textContent).toMatch(/CID, a hash of its content/);
  });

  it("says papers and ratings are both Knowledge Assets, minted and held by LabsTrail's node", () => {
    render(<AboutPage />);

    const assets = screen.getByRole("region", { name: "Papers and ratings are Knowledge Assets" });
    expect(screen.getByRole("heading", { level: 3, name: "A paper" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "A rating" })).toBeTruthy();
    expect(assets.textContent).toMatch(/signature of that CID/);
    expect(assets.textContent).toMatch(/holds their tokens/);
  });

  it("lists what comes next, in order, each with its status and why", () => {
    render(<AboutPage />);

    const next = screen.getByRole("region", { name: "What comes next" });
    const items = [...next.querySelectorAll("li")].map((item) => item.textContent ?? "");
    const steps = [...next.querySelectorAll("li")].map((item) => [
      item.querySelector("span")?.textContent,
      item.querySelector("h3")?.textContent,
    ]);
    expect(steps).toEqual([
      ["next", "Transparent human review"],
      ["planned", "Payment, for people and AI agents"],
      ["planned", "An API for AI agents"],
      ["planned", "A lasting, decentralized copy of every paper"],
      ["later", "Wet-lab replication"],
    ]);
    expect(items[0]).toMatch(/Chainlink VRF/);
    expect(items[0]).toMatch(/no one, LabsTrail included, can steer who is picked/);
    expect(items[0]).toMatch(/not decided yet: reviewers stake to join the pool, are paid/);
    expect(items[1]).toMatch(/a requester pays only their gas/);
    expect(items[1]).toMatch(/The plan, not decided yet/);
    expect(items[3]).toMatch(/only more copies keep it available/);
  });

  it("says the records live on testnets until mainnet", () => {
    render(<AboutPage />);

    expect(
      screen.getByText(
        /Base Sepolia, a testnet, until a payment plan is in place; then LabsTrail moves to mainnet/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /a requester pays only their gas, and LabsTrail pays to publish and to rate/,
      ),
    ).toBeTruthy();
  });

  it("says visits are counted with Vercel Web Analytics, without cookies", () => {
    render(<AboutPage />);

    expect(screen.getByText(/Vercel Web Analytics, which sets no cookies/)).toBeTruthy();
  });

  it("has its own title, description and canonical address", () => {
    expect(metadata).toMatchObject({ title: "About", alternates: { canonical: "/about" } });
    expect(metadata.description).not.toBe(SITE.description);
  });
});
