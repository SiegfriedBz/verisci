const DAY_MS = 24 * 60 * 60 * 1000;

/** A count of calls allowed per UTC day. */
export interface DailyBudget {
  readonly limit: number;
  /** Takes one call from today's budget; false when it is used up. */
  tryUse(): boolean;
  /** Calls taken today. */
  used(): number;
}

/** A budget of `limit` calls per UTC day, reset at midnight UTC by the clock `now`. */
export function createDailyBudget(limit: number, now: () => number): DailyBudget {
  let day = Math.floor(now() / DAY_MS);
  let count = 0;

  const today = () => {
    const current = Math.floor(now() / DAY_MS);
    if (current !== day) {
      day = current;
      count = 0;
    }
  };

  return {
    limit,
    tryUse() {
      today();
      if (count >= limit) return false;
      count++;
      return true;
    },
    used() {
      today();
      return count;
    },
  };
}
