import { describe, expect, it } from "vitest";
import { EnvError } from "./define-env.ts";
import { createSharedEnv, sharedEnv } from "./shared.ts";

describe("createSharedEnv", () => {
  it("returns NODE_ENV and APP_ENV as given", () => {
    const env = createSharedEnv({ NODE_ENV: "production", APP_ENV: "staging" });

    expect({ ...env }).toEqual({ NODE_ENV: "production", APP_ENV: "staging" });
  });

  it("defaults APP_ENV to local when unset", () => {
    expect(createSharedEnv({}).APP_ENV).toBe("local");
  });

  it("treats an empty APP_ENV as unset", () => {
    expect(createSharedEnv({ APP_ENV: "" }).APP_ENV).toBe("local");
  });

  it.each([{}, { APP_ENV: "" }])("requires APP_ENV in a production build (given %o)", (appEnv) => {
    const error = catchEnvError(() => createSharedEnv({ NODE_ENV: "production", ...appEnv }));

    expect(error.issues.map((issue) => issue.variable)).toEqual(["APP_ENV"]);
  });

  it("defaults NODE_ENV to development when unset", () => {
    expect(createSharedEnv({}).NODE_ENV).toBe("development");
  });

  it("throws an EnvError naming APP_ENV when it is invalid", () => {
    const error = catchEnvError(() => createSharedEnv({ APP_ENV: "prod" }));

    expect(error.message).toContain("APP_ENV");
    expect(error.issues.map((issue) => issue.variable)).toEqual(["APP_ENV"]);
  });

  it("names every invalid variable in a single EnvError", () => {
    const error = catchEnvError(() => createSharedEnv({ NODE_ENV: "staging", APP_ENV: "prod" }));

    expect(error.message).toContain("NODE_ENV");
    expect(error.message).toContain("APP_ENV");
    expect(error.issues.map((issue) => issue.variable).sort()).toEqual(["APP_ENV", "NODE_ENV"]);
  });
});

describe("sharedEnv", () => {
  it("reads NODE_ENV from process.env, which Vitest sets to test", () => {
    expect(sharedEnv.NODE_ENV).toBe("test");
  });
});

function catchEnvError(run: () => unknown): EnvError {
  try {
    run();
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error("expected an EnvError, but nothing was thrown");
}
