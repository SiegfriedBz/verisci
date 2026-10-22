import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { SiteFooter } = await import("./site-footer.tsx");

const STAGING = "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90";
const ANVIL = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

describe("SiteFooter", () => {
  afterEach(cleanup);

  it("links the environment's RatingController on Basescan", () => {
    render(<SiteFooter ratingController={{ address: STAGING, local: false }} />);

    const row = screen.getByText("RatingController").closest("li");
    expect(row?.querySelector("a")?.getAttribute("href")).toMatch(
      new RegExp(`/address/${STAGING}`),
    );
  });

  it("shows the Anvil contract locally, unlinked, since no explorer shows Anvil", () => {
    render(<SiteFooter ratingController={{ address: ANVIL, local: true }} />);

    const row = screen.getByText("RatingController").closest("li");
    expect(row?.textContent).toMatch(/Anvil/);
    expect(row?.textContent).toMatch(/0x5fbdb2/);
    expect(row?.querySelector("a")).toBeNull();
  });

  it("leaves the RatingController out where none is deployed", () => {
    render(<SiteFooter ratingController={undefined} />);

    expect(screen.queryByText("RatingController")).toBeNull();
  });

  it("links how the score works and who builds LabsTrail", () => {
    render(<SiteFooter ratingController={undefined} />);

    expect(screen.getByRole("link", { name: "How the score works" }).getAttribute("href")).toBe(
      "/method",
    );
    expect(screen.getByRole("link", { name: "About LabsTrail" }).getAttribute("href")).toBe(
      "/about",
    );
  });

  it("adds no heading to the page's outline", () => {
    const { container } = render(<SiteFooter ratingController={undefined} />);

    expect(container.querySelectorAll("h1, h2, h3")).toHaveLength(0);
    expect(screen.getByText("Contracts behind every record")).toBeTruthy();
  });
});
