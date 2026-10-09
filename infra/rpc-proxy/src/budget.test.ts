import { describe, expect, it } from "vitest";
import { createDailyBudget } from "./budget.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("createDailyBudget", () => {
  it("allows calls up to the limit over the day, then refuses", () => {
    let now = 0;
    const budget = createDailyBudget(48, () => now);
    const taken: boolean[] = [];
    for (let h = 0; h < 24; h++) {
      now = h * HOUR;
      taken.push(budget.tryUse(), budget.tryUse());
    }
    expect(taken.every(Boolean)).toBe(true);
    expect(budget.used()).toBe(48);
    now = 23 * HOUR + 1;
    expect(budget.tryUse()).toBe(false);
  });

  it("paces the budget: an hour takes at most a 24th of it", () => {
    let now = 0;
    const budget = createDailyBudget(48, () => now);
    expect([budget.tryUse(), budget.tryUse(), budget.tryUse()]).toEqual([true, true, false]);
    expect(budget.available()).toBe(false);
    now = HOUR;
    expect(budget.available()).toBe(true);
    expect(budget.tryUse()).toBe(true);
  });

  it("starts again at the next UTC day", () => {
    let now = DAY - 1;
    const budget = createDailyBudget(24, () => now);
    expect(budget.tryUse()).toBe(true);
    expect(budget.tryUse()).toBe(false);
    now = DAY;
    expect(budget.used()).toBe(0);
    expect(budget.tryUse()).toBe(true);
  });
});
