import { describe, expect, it } from "vitest";
import { type PublishProblem, publishProblemMessage, refusalMessage } from "./messages.ts";
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
