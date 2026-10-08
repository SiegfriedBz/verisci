import { describe, expect, it } from "vitest";
import { createDailyBudget } from "./budget.ts";

const DAY = 24 * 60 * 60 * 1000;

describe("createDailyBudget", () => {
  it("allows calls up to the limit, then refuses", () => {
    const budget = createDailyBudget(2, () => 1_000);
    expect([budget.tryUse(), budget.tryUse(), budget.tryUse()]).toEqual([true, true, false]);
    expect(budget.used()).toBe(2);
  });

  it("starts again at the next UTC day", () => {
    let now = DAY - 1;
    const budget = createDailyBudget(1, () => now);
    expect(budget.tryUse()).toBe(true);
    expect(budget.tryUse()).toBe(false);
    now = DAY;
    expect(budget.used()).toBe(0);
    expect(budget.tryUse()).toBe(true);
  });
});
