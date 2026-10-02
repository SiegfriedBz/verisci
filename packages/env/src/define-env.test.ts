import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { defineEnv, EnvError } from "./define-env.ts";
import { createSharedEnv, sharedSchema } from "./shared.ts";

describe("defineEnv", () => {
  it("never puts a variable's value in the error", () => {
    const secret = "sk-live-123";
    let caught: unknown;
    try {
      defineEnv({
        server: { SECRET_URL: z.url() },
        runtimeEnv: { SECRET_URL: secret },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvError);
    const error = caught as EnvError;
    expect(error.message).toContain("SECRET_URL");
    expect(error.message).not.toContain(secret);
    expect(JSON.stringify(error.issues)).not.toContain(secret);
  });

  it("merges a consumer schema with the shared env it extends", () => {
    const runtimeEnv = { APP_ENV: "staging", DKG_URL: "https://dkg.example" };
    const env = defineEnv({
      extends: [createSharedEnv(runtimeEnv)],
      server: { DKG_URL: z.url() },
      runtimeEnv,
    });

    expect(env.DKG_URL).toBe("https://dkg.example");
    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_ENV).toBe("staging");
    expectTypeOf(env.DKG_URL).toEqualTypeOf<string>();
    expectTypeOf(env.APP_ENV).toEqualTypeOf<"local" | "staging" | "production">();
  });

  it("throws an EnvError naming a missing consumer variable", () => {
    expect(() =>
      defineEnv({
        extends: [createSharedEnv({})],
        server: { DKG_URL: z.url() },
        runtimeEnv: {},
      }),
    ).toThrow(expect.objectContaining({ message: expect.stringContaining("DKG_URL") }));
    expect(() => defineEnv({ server: { DKG_URL: z.url() }, runtimeEnv: {} })).toThrow(EnvError);
  });

  it.each(["1", "true"])("skips validation when SKIP_ENV_VALIDATION is %s", (flag) => {
    expect(() =>
      defineEnv({
        server: sharedSchema,
        runtimeEnv: { APP_ENV: "prod", SKIP_ENV_VALIDATION: flag },
      }),
    ).not.toThrow();
  });

  it.each([["0"], [undefined]])("still validates when SKIP_ENV_VALIDATION is %s", (flag) => {
    expect(() =>
      defineEnv({
        server: sharedSchema,
        runtimeEnv: { APP_ENV: "prod", SKIP_ENV_VALIDATION: flag },
      }),
    ).toThrow(EnvError);
  });

  it("leaves the given runtimeEnv untouched", () => {
    const runtimeEnv = { APP_ENV: "" };
    defineEnv({ server: sharedSchema, runtimeEnv });

    expect(runtimeEnv).toEqual({ APP_ENV: "" });
  });
});
