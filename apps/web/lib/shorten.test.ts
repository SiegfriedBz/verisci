import { describe, expect, it } from "vitest";
import { shorten } from "./shorten.ts";

describe("shorten", () => {
  it("keeps the head and tail of a long value", () => {
    expect(shorten("0x2b2e1bcb7c52a1587264e01f6b53782d791e6fa0", 8, 6)).toBe("0x2b2e1b…1e6fa0");
  });

  it("leaves a short value whole", () => {
    expect(shorten("0x1234", 8, 6)).toBe("0x1234");
  });
});
