import { useLiveQuery } from "dexie-react-hooks";
import { isPlanned, logDone, readBoard } from "@/entities/habit";
import { getPrefs, isVacation } from "@/entities/prefs";
import { moodScore } from "@/entities/day";
import { addDays, dateKey, hourInZone, keysBetween, weekdayOf } from "@/shared/lib/date";
import { createId } from "@/shared/lib/id";
import { db, type Wish } from "@/shared/db";

/* ---------- Points & levels ---------- */

export const pointRules = { habit: 10, minimum: 5, task: 5, topTask: 5, focus: 15, mood: 5, gratitude: 5, entry: 5, review: 10 } as const;

export function levelFor(points: number) {
  let level = 1;
  while (50 * (level + 1) * level <= points) level += 1;
  const floor = 50 * level * (level - 1);
  const ceil = 50 * (level + 1) * level;
  return { level, floor, ceil, progress: (points - floor) / (ceil - floor), toNext: ceil - points };
}

export const plantStages = ["o-sprout-soil", "m-sprout", "i-sprout", "o-sprout-big", "o-sprout-bud", "o-plant-bud", "o-pot-flower", "c-big-flower"] as const;

export function stageFor(level: number) {
  return Math.min(plantStages.length - 1, level - 1);
}

type Totals = {
  earned: number;
  spent: number;
  balance: number;
  habitChecks: number;
  tasksDone: number;
  focusSessions: number;
  focusMinutes: number;
  moodDays: number;
  gratitudeDays: number;
  entries: number;
  reviews: number;
  goalsDone: number;
  bestStreak: number;
  currentBest: number;
};

async function readTotals(userId: string): Promise<Totals> {
  const [habits, logs, tasks, focus, days, entries, reviews, goals, redemptions, wishes, board] = await Promise.all([
    db.habits.where("userId").equals(userId).toArray(),
    db.habitLogs.where("userId").equals(userId).toArray(),
    db.tasks.where("userId").equals(userId).toArray(),
    db.focusSessions.where("userId").equals(userId).toArray(),
    db.days.where("userId").equals(userId).toArray(),
    db.journalEntries.where("userId").equals(userId).toArray(),
    db.reviews.where("userId").equals(userId).toArray(),
    db.goals.where("userId").equals(userId).toArray(),
    db.redemptions.where("userId").equals(userId).toArray(),
    db.wishes.where("userId").equals(userId).toArray(),
    readBoard(userId),
  ]);
  const byId = new Map(habits.map((habit) => [habit.id, habit]));
  let habitPoints = 0;
  let habitChecks = 0;
  for (const log of logs) {
    const habit = byId.get(log.habitId);
    if (!habit || !logDone(habit, log)) continue;
    habitChecks += 1;
    habitPoints += log.kind === "min" ? pointRules.minimum : pointRules.habit;
  }
  const done = tasks.filter((task) => task.done);
  const focusDone = focus.filter((session) => session.status === "completed" && (session.kind ?? "focus") === "focus");
  const moodDays = days.filter((day) => day.mood).length;
  const gratitudeDays = days.filter((day) => (day.good ?? []).some((line) => line.trim()) || day.win?.trim()).length;
  const earned =
    habitPoints +
    done.length * pointRules.task +
    done.filter((task) => task.top).length * pointRules.topTask +
    focusDone.length * pointRules.focus +
    moodDays * pointRules.mood +
    gratitudeDays * pointRules.gratitude +
    entries.length * pointRules.entry +
    reviews.length * pointRules.review;
  const spent = redemptions.reduce((sum, row) => sum + (row.cost ?? wishes.find((wish) => wish.id === row.rewardId)?.cost ?? 0), 0);
  return {
    earned,
    spent,
    balance: Math.max(0, earned - spent),
    habitChecks,
    tasksDone: done.length,
    focusSessions: focusDone.length,
    focusMinutes: focusDone.reduce((sum, session) => sum + Math.round(session.plannedSec / 60), 0),
    moodDays,
    gratitudeDays,
    entries: entries.length,
    reviews: reviews.length,
    goalsDone: goals.filter((goal) => goal.doneAt).length,
    bestStreak: board.cards.reduce((max, card) => Math.max(max, card.best), 0),
    currentBest: board.bestStreak,
  };
}

/* ---------- Badges ---------- */

export type BadgeId =
  | "first"
  | "streak3"
  | "streak7"
  | "streak14"
  | "streak30"
  | "focus10"
  | "deep"
  | "mood7"
  | "grateful"
  | "reflect"
  | "goal"
  | "planner"
  | "mountain";

export const badges: Array<{ id: BadgeId; art: string; test: (t: Totals) => number; goal: number }> = [
  { id: "first", art: "i-sprout", test: (t) => t.habitChecks, goal: 1 },
  { id: "streak3", art: "b-3days", test: (t) => t.bestStreak, goal: 3 },
  { id: "streak7", art: "b-7days", test: (t) => t.bestStreak, goal: 7 },
  { id: "streak14", art: "b-14days", test: (t) => t.bestStreak, goal: 14 },
  { id: "streak30", art: "b-30days", test: (t) => t.bestStreak, goal: 30 },
  { id: "focus10", art: "m-flame", test: (t) => t.focusSessions, goal: 10 },
  { id: "deep", art: "o-headphones", test: (t) => t.focusMinutes, goal: 600 },
  { id: "mood7", art: "mood-amazing", test: (t) => t.moodDays, goal: 7 },
  { id: "grateful", art: "i-heart", test: (t) => t.gratitudeDays, goal: 10 },
  { id: "reflect", art: "o-journal", test: (t) => t.reviews, goal: 1 },
  { id: "goal", art: "o-target-heart", test: (t) => t.goalsDone, goal: 1 },
  { id: "planner", art: "i-list", test: (t) => t.tasksDone, goal: 25 },
  { id: "mountain", art: "b-mountain", test: (t) => t.habitChecks, goal: 100 },
];

export type BadgeView = { id: BadgeId; art: string; value: number; goal: number; earned: boolean };

export type Progress = Totals & {
  level: ReturnType<typeof levelFor>;
  stage: number;
  badges: BadgeView[];
};

export function useProgress(userId: string) {
  return useLiveQuery(async (): Promise<Progress> => {
    const totals = await readTotals(userId);
    const level = levelFor(totals.earned);
    return {
      ...totals,
      level,
      stage: stageFor(level.level),
      badges: badges.map((badge) => {
        const value = badge.test(totals);
        return { id: badge.id, art: badge.art, value: Math.min(value, badge.goal), goal: badge.goal, earned: value >= badge.goal };
      }),
    };
  }, [userId]);
}

/* ---------- Rewards ---------- */

export type RewardView = Wish & { redeemed: number; unlocked: boolean; progress: number };

export function useRewards(userId: string) {
  return useLiveQuery(async () => {
    const [wishes, redemptions, totals] = await Promise.all([
      db.wishes.where("userId").equals(userId).toArray(),
      db.redemptions.where("userId").equals(userId).toArray(),
      readTotals(userId),
    ]);
    const views: RewardView[] = wishes.map((wish) => {
      const redeemed = redemptions.filter((row) => row.rewardId === wish.id).length;
      if (wish.streak) {
        return { ...wish, redeemed, unlocked: totals.currentBest >= wish.streak, progress: Math.min(1, totals.currentBest / wish.streak) };
      }
      return { ...wish, redeemed, unlocked: totals.balance >= wish.cost, progress: Math.min(1, totals.balance / Math.max(1, wish.cost)) };
    });
    return {
      streakRewards: views.filter((view) => view.streak).sort((a, b) => (a.streak ?? 0) - (b.streak ?? 0)),
      shop: views.filter((view) => !view.streak).sort((a, b) => a.cost - b.cost),
      history: redemptions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      balance: totals.balance,
      currentBest: totals.currentBest,
    };
  }, [userId]);
}

export async function addReward(userId: string, title: string, options: { cost?: number; streak?: number | null; icon?: string | null }) {
  const trimmed = title.trim();
  if (!trimmed) return;
  await db.wishes.add({
    id: createId(),
    userId,
    title: trimmed,
    cost: options.streak ? 0 : Math.max(1, options.cost ?? 100),
    streak: options.streak ?? null,
    icon: options.icon ?? null,
  });
}

export async function removeReward(userId: string, id: string) {
  const row = await db.wishes.get(id);
  if (row?.userId === userId) await db.wishes.delete(id);
}

export async function redeemReward(userId: string, id: string): Promise<boolean> {
  const wish = await db.wishes.get(id);
  if (!wish || wish.userId !== userId) return false;
  const totals = await readTotals(userId);
  if (wish.streak ? totals.currentBest < wish.streak : totals.balance < wish.cost) return false;
  await db.redemptions.add({ id: createId(), userId, rewardId: id, cost: wish.streak ? 0 : wish.cost, createdAt: new Date().toISOString() });
  return true;
}

/* ---------- Period stats & insights ---------- */

export type DayStat = { key: string; planned: number; done: number; rate: number | null; tasks: number; focus: number; mood: number | null; sleep: number | null; energy: number | null };

export type Insight =
  | { kind: "bestTime"; part: "morning" | "afternoon" | "evening" | "night"; share: number }
  | { kind: "skipped"; name: string; rate: number }
  | { kind: "strongest"; name: string; streak: number }
  | { kind: "bestDay"; weekday: number; rate: number }
  | { kind: "sleepMood"; better: number }
  | { kind: "focusDay"; weekday: number; minutes: number };

export type PeriodStats = {
  from: string;
  to: string;
  days: DayStat[];
  rate: number;
  planned: number;
  done: number;
  tasksDone: number;
  tasksTotal: number;
  focusMinutes: number;
  moodAvg: number | null;
  sleepAvg: number | null;
  checkInDays: number;
  perHabit: Array<{ id: string; name: string; icon: string; tone: string; rate: number; done: number; planned: number }>;
  insights: Insight[];
  previousRate: number | null;
};

function partOf(hour: number): "morning" | "afternoon" | "evening" | "night" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export async function readPeriod(userId: string, from: string, to: string): Promise<Omit<PeriodStats, "insights" | "previousRate">> {
  const [prefs, habitsAll, logs, tasks, focus, dayRows] = await Promise.all([
    getPrefs(userId),
    db.habits.where("userId").equals(userId).toArray(),
    db.habitLogs.where("userId").equals(userId).toArray(),
    db.tasks.where("userId").equals(userId).toArray(),
    db.focusSessions.where("userId").equals(userId).toArray(),
    db.days.where("userId").equals(userId).toArray(),
  ]);
  const today = dateKey();
  const keys = keysBetween(from, to < today ? to : today);
  const habits = habitsAll.filter((habit) => habit.deletedAt === null);
  const logKey = new Map(logs.map((log) => [`${log.habitId}:${log.dateKey}`, log]));
  const dayMap = new Map(dayRows.map((row) => [row.dateKey, row]));
  const focusDone = focus.filter((session) => session.status === "completed" && (session.kind ?? "focus") === "focus");
  const perHabit = habits.map((habit) => ({ id: habit.id, name: habit.name, icon: habit.icon ?? "i-sprout", tone: habit.tone ?? "mint", done: 0, planned: 0, rate: 0 }));
  const days: DayStat[] = keys.map((key) => {
    let planned = 0;
    let done = 0;
    habits.forEach((habit, index) => {
      if (key < habit.createdAt.slice(0, 10)) return;
      const hit = logDone(habit, logKey.get(`${habit.id}:${key}`));
      const counts = isPlanned(habit, key) && !isVacation(prefs, key) && !habit.vacation;
      if (counts || hit) {
        planned += 1;
        perHabit[index]!.planned += 1;
      }
      if (hit) {
        done += 1;
        perHabit[index]!.done += 1;
      }
    });
    const day = dayMap.get(key);
    return {
      key,
      planned,
      done,
      rate: planned ? done / planned : null,
      tasks: tasks.filter((task) => task.done && (task.doneAt ? dateKey(new Date(task.doneAt)) : task.dateKey) === key).length,
      focus: focusDone.filter((session) => dateKey(new Date(session.startedAt)) === key).reduce((sum, session) => sum + Math.round(session.plannedSec / 60), 0),
      mood: day?.mood ? moodScore[day.mood] : null,
      sleep: day?.sleepHours ?? null,
      energy: day?.energy ?? null,
    };
  });
  const planned = days.reduce((sum, day) => sum + day.planned, 0);
  const done = days.reduce((sum, day) => sum + day.done, 0);
  const inRange = tasks.filter((task) => task.dateKey >= from && task.dateKey <= to);
  const moods = days.map((day) => day.mood).filter((value): value is number => value !== null);
  const sleeps = days.map((day) => day.sleep).filter((value): value is number => value !== null);
  return {
    from,
    to,
    days,
    rate: planned ? done / planned : 0,
    planned,
    done,
    tasksDone: days.reduce((sum, day) => sum + day.tasks, 0),
    tasksTotal: inRange.length,
    focusMinutes: days.reduce((sum, day) => sum + day.focus, 0),
    moodAvg: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
    sleepAvg: sleeps.length ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null,
    checkInDays: moods.length,
    perHabit: perHabit.map((row) => ({ ...row, rate: row.planned ? row.done / row.planned : 0 })).sort((a, b) => b.rate - a.rate),
  };
}

async function readInsights(userId: string): Promise<Insight[]> {
  const today = dateKey();
  const from = addDays(today, -29);
  const [period, logs, tasks, focus, board] = await Promise.all([
    readPeriod(userId, from, today),
    db.habitLogs.where("userId").equals(userId).toArray(),
    db.tasks.where("userId").equals(userId).toArray(),
    db.focusSessions.where("userId").equals(userId).toArray(),
    readBoard(userId),
  ]);
  const insights: Insight[] = [];

  const stamps = [
    ...logs.filter((log) => log.at && log.kind !== "makeup" && log.dateKey >= from).map((log) => log.at!),
    ...tasks.filter((task) => task.doneAt && task.dateKey >= from).map((task) => task.doneAt!),
    ...focus.filter((session) => session.status === "completed").map((session) => session.startedAt),
  ];
  if (stamps.length >= 5) {
    const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    for (const stamp of stamps) buckets[partOf(hourInZone(new Date(stamp)))] += 1;
    const [part, count] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]!;
    insights.push({ kind: "bestTime", part: part as keyof typeof buckets, share: count / stamps.length });
  }

  const strongest = board.cards.slice().sort((a, b) => b.streak - a.streak)[0];
  if (strongest && strongest.streak >= 2) insights.push({ kind: "strongest", name: strongest.name, streak: strongest.streak });

  const skipped = period.perHabit.filter((row) => row.planned >= 4).sort((a, b) => a.rate - b.rate)[0];
  if (skipped && skipped.rate < 0.75) insights.push({ kind: "skipped", name: skipped.name, rate: skipped.rate });

  const byWeekday = Array.from({ length: 7 }, () => ({ planned: 0, done: 0, focus: 0 }));
  for (const day of period.days) {
    const slot = byWeekday[weekdayOf(day.key)]!;
    slot.planned += day.planned;
    slot.done += day.done;
    slot.focus += day.focus;
  }
  const bestDay = byWeekday
    .map((slot, weekday) => ({ weekday, rate: slot.planned >= 3 ? slot.done / slot.planned : -1 }))
    .sort((a, b) => b.rate - a.rate)[0];
  if (bestDay && bestDay.rate > 0) insights.push({ kind: "bestDay", weekday: bestDay.weekday, rate: bestDay.rate });

  const focusDay = byWeekday.map((slot, weekday) => ({ weekday, minutes: slot.focus })).sort((a, b) => b.minutes - a.minutes)[0];
  if (focusDay && focusDay.minutes >= 25) insights.push({ kind: "focusDay", weekday: focusDay.weekday, minutes: focusDay.minutes });

  const rested = period.days.filter((day) => day.sleep !== null && day.mood !== null);
  const good = rested.filter((day) => day.sleep! >= 7).map((day) => day.mood!);
  const short = rested.filter((day) => day.sleep! < 7).map((day) => day.mood!);
  if (good.length >= 2 && short.length >= 2) {
    const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const better = avg(good) - avg(short);
    if (better > 0.2) insights.push({ kind: "sleepMood", better });
  }
  return insights;
}

export function usePeriodStats(userId: string, from: string, to: string) {
  return useLiveQuery(async (): Promise<PeriodStats> => {
    const span = keysBetween(from, to).length;
    const [current, previous, insights] = await Promise.all([
      readPeriod(userId, from, to),
      readPeriod(userId, addDays(from, -span), addDays(from, -1)),
      readInsights(userId),
    ]);
    return { ...current, insights, previousRate: previous.planned ? previous.rate : null };
  }, [userId, from, to]);
}
