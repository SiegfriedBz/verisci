import { describe, expect, it } from "vitest";
import { functions } from "./index.ts";

describe("functions", () => {
  it("lists the publish function, built without reading any setting", () => {
    expect(functions.map((fn) => fn.id())).toEqual(["publish-paper"]);
  });
});
