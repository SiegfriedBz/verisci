import { Inngest } from "inngest";
import { describe, expect, it, vi } from "vitest";
import { alertOnFailure, createFailureAlerts, failureText } from "./on-failure.ts";

const failed = (functionId: string, message: string) => ({
  function_id: functionId,
  run_id: "01JRUN",
  error: { name: "NonRetriableError", message },
  event: { name: "labstrail/rating.requested", data: {} },
});

describe("failureText", () => {
  it("names the function, the run and the reason the error carries", () => {
    expect(
      failureText(
        failed(
          "verisci-rate-paper",
          "rating-failed:scorer-unavailable: verisci-rka-0xab gave up after 6 attempts: scorer unreachable (HTTP 503)",
        ),
      ),
    ).toBe(
      "verisci-rate-paper failed (run 01JRUN): rating-failed:scorer-unavailable: verisci-rka-0xab gave up after 6 attempts: scorer unreachable (HTTP 503)",
    );
  });

  it("keeps the error's first line, at most 300 characters", () => {
    const text = failureText(
      failed("verisci-publish-paper", `publish-failed:setup: ${"x".repeat(400)}\nstack`),
    );

    expect(text?.endsWith("…")).toBe(true);
    expect(text).not.toContain("stack");
    expect(text?.length).toBeLessThanOrEqual(
      "verisci-publish-paper failed (run 01JRUN): ".length + 301,
    );
  });

  it("is undefined for its own failures and for data that isn't a failure", () => {
    expect(failureText(failed("verisci-alert-on-failure", "x"))).toBeUndefined();
    expect(failureText({ nothing: true })).toBeUndefined();
  });

  it("names a cancelled run, which Inngest cancels past its time budget, and skips its own", () => {
    expect(failureText(failed("verisci-publish-paper", "function cancelled"), "cancelled")).toBe(
      "verisci-publish-paper cancelled (run 01JRUN): past its time budget, or by hand",
    );
    expect(
      failureText(failed("verisci-alert-on-failure", "function cancelled"), "cancelled"),
    ).toBeUndefined();
  });
});

describe("alertOnFailure", () => {
  /**
   * A step that runs at once, round-trips its output through JSON and records its id, and an
   * alert that records its text.
   */
  function setup() {
    const log: string[] = [];
    const alert = vi.fn(async (_text: string) => {});
    const step = {
      async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
        log.push(id);
        return JSON.parse(JSON.stringify(await fn()));
      },
    };
    return { log, alert, step };
  }

  it("sends one alert from a step of its own", async () => {
    const { log, alert, step } = setup();

    expect(
      await alertOnFailure(
        {
          name: "inngest/function.failed",
          data: failed("verisci-publish-paper", "publish-failed:setup: x"),
        },
        step,
        alert,
      ),
    ).toEqual({ alerted: true });
    expect(log).toEqual(["alert"]);
    expect(alert).toHaveBeenCalledExactlyOnceWith(
      "verisci-publish-paper failed (run 01JRUN): publish-failed:setup: x",
    );
  });

  it("alerts on a cancelled run whose event carries only the function and run ids, as the SDK types it", async () => {
    const { alert, step } = setup();

    expect(
      await alertOnFailure(
        {
          name: "inngest/function.cancelled",
          data: { function_id: "verisci-rate-paper", run_id: "01JRUN" },
        },
        step,
        alert,
      ),
    ).toEqual({ alerted: true });
    expect(alert).toHaveBeenCalledExactlyOnceWith(
      "verisci-rate-paper cancelled (run 01JRUN): past its time budget, or by hand",
    );
  });

  it("alerts on a cancelled run too", async () => {
    const { alert, step } = setup();

    await alertOnFailure(
      {
        name: "inngest/function.cancelled",
        data: failed("verisci-rate-paper", "function cancelled"),
      },
      step,
      alert,
    );

    expect(alert).toHaveBeenCalledExactlyOnceWith(
      "verisci-rate-paper cancelled (run 01JRUN): past its time budget, or by hand",
    );
  });

  it("sends nothing for its own failure, so a failing alert never alerts again", async () => {
    const { log, alert, step } = setup();

    expect(
      await alertOnFailure(
        { name: "inngest/function.failed", data: failed("verisci-alert-on-failure", "x") },
        step,
        alert,
      ),
    ).toEqual({ alerted: false });
    expect(log).toEqual([]);
    expect(alert).not.toHaveBeenCalled();
  });
});

describe("createFailureAlerts", () => {
  it("runs on every function's failure and cancel", () => {
    const fn = createFailureAlerts(new Inngest({ id: "labstrail-test" }), async () => {});

    expect(fn.opts.id).toBe("alert-on-failure");
    expect(fn.opts.triggers).toEqual([
      { event: "inngest/function.failed" },
      { event: "inngest/function.cancelled" },
    ]);
  });
});
