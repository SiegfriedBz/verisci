import { describe, expect, it } from "vitest";
import { inngest } from "./inngest.ts";

describe("inngest", () => {
  it("keeps the app id verisci, under which Inngest keeps every function's runs", () => {
    expect(inngest.id).toBe("verisci");
  });
});
