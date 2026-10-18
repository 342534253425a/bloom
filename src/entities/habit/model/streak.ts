import { addDays } from "@/shared/lib/date";

export type StreakRules = {
  /** Days before this key do not count at all. */
  start: string;
  /** Planned on this day? Unplanned days never break a chain. */
  planned: (key: string) => boolean;
  /** Vacation or pause: the chain freezes instead of breaking. */
  paused: (key: string) => boolean;
};

export const everyDay: StreakRules = { start: "0000-01-01", planned: () => true, paused: () => false };

/** Counts done days back from today. A missed planned day breaks the chain; today never does. */
export function currentStreak(done: ReadonlySet<string>, today: string, rules: StreakRules = everyDay): number {
  let count = 0;
  let cursor = today;
  for (let guard = 0; guard < 1500 && cursor >= rules.start; guard += 1) {
    if (done.has(cursor)) count += 1;
    else if (cursor !== today && rules.planned(cursor) && !rules.paused(cursor)) break;
    cursor = addDays(cursor, -1);
  }
  return count;
}

export function longestStreak(done: ReadonlySet<string>, today: string, rules: StreakRules = everyDay): number {
  let best = 0;
  let run = 0;
  const first = [...done].sort()[0];
  if (!first) return 0;
  for (let cursor = first; cursor <= today; cursor = addDays(cursor, 1)) {
    if (done.has(cursor)) {
      run += 1;
      best = Math.max(best, run);
    } else if (cursor !== today && rules.planned(cursor) && !rules.paused(cursor)) {
      run = 0;
    }
  }
  return best;
}
