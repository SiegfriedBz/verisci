import { describe, expect, it } from "vitest";
import { cancelMessage, requestMessage, summaryLabel } from "./messages.ts";

describe("cancelMessage", () => {
  it("names every cause of an invalid target in plain words", () => {
    const message = cancelMessage("invalid-target");
    expect(message.title).toBe("This paper can't be rated");
    expect(message.body).toMatch(/life sciences/);
    expect(message.body).toMatch(/text/);
    expect(message.body).toMatch(/LabsTrail/);
  });

  it("says an expired rating couldn't finish within a day", () => {
    expect(cancelMessage("expired").title).toBe("The rating couldn't finish within a day");
  });
});

describe("requestMessage", () => {
  it.each([
    ["too-many-pending", "You already have 3 ratings waiting. Try again when one finishes."],
    ["paused", "Ratings are paused for now."],
  ] as const)("words %s", (problem, text) => {
    expect(requestMessage(problem)).toBe(text);
  });

  it("words a failure it can't name", () => {
    expect(requestMessage("unavailable")).toMatch(/didn't go through/);
    expect(requestMessage("refused")).toMatch(/contract refused/);
  });
});

describe("summaryLabel", () => {
  it.each([
    [{ kind: "scored", score: 67, requestId: "0x1" }, "67"],
    [{ kind: "pending" }, "Pending"],
    [{ kind: "unrated" }, "Not rated"],
    [{ kind: "cannot-rate" }, "Can't be rated"],
    [{ kind: "unknown" }, "Not checked"],
  ] as const)("labels %o as %s", (summary, label) => {
    expect(summaryLabel(summary)).toBe(label);
  });
});
