import { describe, expect, it } from "vitest";
import { renderAbiModule } from "./generate-abi.ts";

describe("renderAbiModule", () => {
  const abi = [{ type: "function", name: "pause", inputs: [], outputs: [] }];

  it("exports the ABI as const, so viem infers its types", () => {
    const module = renderAbiModule(abi);
    expect(module).toContain("export const ratingControllerAbi = [");
    expect(module).toContain("] as const;");
    expect(module).toContain('"name": "pause"');
  });

  it("says how to regenerate it", () => {
    expect(renderAbiModule(abi)).toContain("generate:abi");
  });

  it("throws when the build artifact has no ABI array", () => {
    expect(() => renderAbiModule(undefined)).toThrow(/forge build/);
  });
});
