import { describe, expect, it } from "vitest";
import {
  failureMessage,
  type PublishProblem,
  publishProblemMessage,
  refusalMessage,
} from "./messages.ts";
import type { RefusalReason } from "./progress.ts";

const problems: PublishProblem[] = [
  "rate-limited",
  "unavailable",
  "upload-failed",
  "not-pinned",
  "signature-declined",
  "bad-signature",
  "expired",
  "too-large",
  "not-a-pdf",
  "wrong-file",
  "malformed",
  "bad-cid",
  "wrong-graph",
];

const refusals: RefusalReason[] = [
  "not-a-pdf",
  "too-large",
  "unparseable",
  "no-title",
  "expired",
  "bad-signature",
  "malformed",
  "bad-cid",
  "wrong-graph",
];

describe("messages", () => {
  it.each(problems)("says something plain for %s, with no dash as punctuation", (problem) => {
    const message = publishProblemMessage(problem);

    expect(message.length).toBeGreaterThan(10);
    expect(message).not.toMatch(/[—–]/);
  });

  it.each(refusals)("explains a %s refusal", (reason) => {
    expect(refusalMessage(reason)).toMatch(/\.$/);
  });

  it("tells the limit apart from a service that is down", () => {
    expect(publishProblemMessage("rate-limited")).toMatch(/24 hours/);
    expect(publishProblemMessage("unavailable")).toMatch(/minute/);
  });
});

describe("refusalMessage", () => {
  it("tells a no-title refusal that pages saved as pictures cannot be read", () => {
    expect(refusalMessage("no-title")).toMatch(/pictures/);
  });
});

describe("failureMessage", () => {
  it.each([
    ["chain-unreachable", /Base/],
    ["paper-unreachable", /PDF/],
    ["node-unreachable", /DKG node/],
    ["mint-not-confirmed", /mint/],
    ["setup", /our side/],
  ] as const)("says why publishing stopped on %s", (reason, words) => {
    expect(failureMessage(reason)).toMatch(words);
    expect(failureMessage(reason)).not.toMatch(/[—–]/);
  });

  it("falls back to a general message when the run named no reason", () => {
    expect(failureMessage(undefined)).toMatch(/couldn't finish/);
  });
});
