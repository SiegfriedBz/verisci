import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Logo } from "./logo.tsx";

describe("Logo", () => {
  afterEach(cleanup);

  it("reads LabsTrail beside the mark, with Trail in the accent", () => {
    const { container } = render(<Logo />);

    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.textContent).toBe("LabsTrail");
    expect(container.querySelector(".text-accent")?.textContent).toBe("Trail");
  });
});
