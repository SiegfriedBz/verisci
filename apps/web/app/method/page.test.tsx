import { checklistOf, STUDY_TYPES } from "@labstrail/core";
import { RATING_SETTINGS } from "@labstrail/workflows";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SITE } from "../../lib/site.ts";
import MethodPage, { metadata } from "./page.tsx";

describe("/method", () => {
  afterEach(cleanup);

  it("says what the score measures, and what it does not", () => {
    render(<MethodPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "How the reproducibility score works",
    );
    expect(screen.getByText(/doesn't say whether the findings are right/)).toBeTruthy();
  });

  it("names every kind of study with its checklist and its number of checks", () => {
    render(<MethodPage />);

    const rows = screen.getAllByRole("listitem").map((row) => row.textContent ?? "");
    for (const type of STUDY_TYPES) {
      const row = rows.find((text) => text.toLowerCase().includes(type.label.toLowerCase()));
      expect(row).toBeDefined();
      expect(row).toContain(`${checklistOf(type.id).length} checks`);
      if (type.source !== "none") expect(row).toContain(type.source);
    }
  });

  it("names the model that scores and how its answers become the score", () => {
    render(<MethodPage />);

    expect(screen.getByText(RATING_SETTINGS.model)).toBeTruthy();
    expect(screen.getByText(/half a point/)).toBeTruthy();
    expect(screen.getByText(/quote is found in the paper/)).toBeTruthy();
  });

  it("says the rating reads the PDF from IPFS and is a Knowledge Asset anchored on Base", () => {
    render(<MethodPage />);

    expect(screen.getByText(/fetches the paper's PDF from IPFS by its CID/)).toBeTruthy();
    expect(screen.getByText(/rating's own Knowledge Asset/).textContent).toMatch(/merkle/);
  });

  it("names the three phases, only the first running", () => {
    render(<MethodPage />);

    for (const phase of ["Reproducibility readiness", "Human review", "Wet-lab replication"]) {
      expect(screen.getByRole("heading", { level: 3, name: phase })).toBeTruthy();
    }
  });

  it("has its own title, description and canonical address", () => {
    expect(metadata).toMatchObject({
      title: "How the score works",
      alternates: { canonical: "/method" },
    });
    expect(metadata.description).toMatch(/reproducibility/);
    expect(metadata.description).not.toBe(SITE.description);
  });
});
