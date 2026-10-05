import { describe, expect, it } from "vitest";
import { ratingControllerAbi } from "./index.ts";

type AbiItem = (typeof ratingControllerAbi)[number];
// Without `as const`, `type` widens to string, nothing matches, and the names are `never`.
type NameOf<T extends AbiItem["type"]> = Extract<AbiItem, { type: T; name: string }>["name"];

describe("ratingControllerAbi", () => {
  it("keeps literal names, so viem infers every function, event and error", () => {
    // These lines typecheck only while the ABI is `as const`.
    const functions: NameOf<"function">[] = ["requestPhase1", "pause", "unpause", "paused"];
    const events: NameOf<"event">[] = ["Phase1Requested", "Paused", "Unpaused"];
    const errors: NameOf<"error">[] = ["NotOracle", "EnforcedPause", "ExpectedPause"];

    const names = ratingControllerAbi.map((item) => ("name" in item ? item.name : item.type));
    expect(names).toEqual(expect.arrayContaining([...functions, ...events, ...errors]));
  });
});
