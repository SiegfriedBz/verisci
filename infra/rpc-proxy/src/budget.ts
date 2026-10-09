const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * A count of calls allowed per UTC day, paced so no hour takes more than a 24th of it:
 * a burst after midnight cannot spend the whole day's budget in minutes.
 */
export interface DailyBudget {
  readonly limit: number;
  /** Takes one call from the budget; false when today's or this hour's share is used up. */
  tryUse(): boolean;
  /** True when a call could be taken now. */
  available(): boolean;
  /** Calls taken today. */
  used(): number;
}

/** A budget of `limit` calls per UTC day, paced per hour, by the clock `now`. */
export function createDailyBudget(limit: number, now: () => number): DailyBudget {
  const hourlyLimit = Math.ceil(limit / 24);
  let day = Math.floor(now() / DAY_MS);
  let hour = Math.floor(now() / HOUR_MS);
  let dayCount = 0;
  let hourCount = 0;

  const refresh = () => {
    const t = now();
    if (Math.floor(t / DAY_MS) !== day) {
      day = Math.floor(t / DAY_MS);
      dayCount = 0;
    }
    if (Math.floor(t / HOUR_MS) !== hour) {
      hour = Math.floor(t / HOUR_MS);
      hourCount = 0;
    }
  };
  const available = () => {
    refresh();
    return dayCount < limit && hourCount < hourlyLimit;
  };

  return {
    limit,
    available,
    tryUse() {
      if (!available()) return false;
      dayCount++;
      hourCount++;
      return true;
    },
    used() {
      refresh();
      return dayCount;
    },
  };
}
