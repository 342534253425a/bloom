import { useLiveQuery } from "dexie-react-hooks";
import { getPrefs, isVacation, type Prefs } from "@/entities/prefs";
import { addDays, dateKey, keysBetween, weekdayOf } from "@/shared/lib/date";
import { createId } from "@/shared/lib/id";
import { db, type Habit, type HabitLog, type HabitLogKind } from "@/shared/db";
import { currentStreak, longestStreak, type StreakRules } from "./model/streak";

export { currentStreak, longestStreak } from "./model/streak";
export type { StreakRules } from "./model/streak";

export type DayState = "done" | "min" | "partial" | "missed" | "off" | "rest" | "future" | "open";

export type HabitCard = Habit & {
  target: number;
  count: number;
  doneToday: boolean;
  minToday: boolean;
  plannedToday: boolean;
  streak: number;
  best: number;
  week: Array<{ key: string; state: DayState }>;
  rate30: number;
};

export function targetOf(habit: Habit): number {
  return Math.max(1, habit.targetCount ?? 1);
}

export function isPlanned(habit: Habit, key: string): boolean {
  if (!habit.days || habit.days.length === 0 || habit.days.length === 7) return true;
  return habit.days.includes(weekdayOf(key));
}

export function logDone(habit: Habit, log: HabitLog | undefined): boolean {
  if (!log) return false;
  return log.kind === "min" || log.kind === "makeup" || log.count >= targetOf(habit);
}

export function rulesFor(habit: Habit, prefs: Prefs, lastDone: string | null): StreakRules {
  const start = habit.createdAt.slice(0, 10);
  return {
    start,
    planned: (key) => isPlanned(habit, key),
    paused: (key) => isVacation(prefs, key) || (habit.vacation === true && (lastDone === null || key > lastDone)),
  };
}

function stateOf(habit: Habit, log: HabitLog | undefined, key: string, today: string, prefs: Prefs): DayState {
  if (key > today) return "future";
  if (log && log.kind === "min") return "min";
  if (logDone(habit, log)) return "done";
  if (log && log.count > 0) return "partial";
  if (key < habit.createdAt.slice(0, 10)) return "off";
  if (isVacation(prefs, key) || habit.vacation) return "rest";
  if (!isPlanned(habit, key)) return "off";
  return key === today ? "open" : "missed";
}

async function activeHabits(userId: string) {
  return (await db.habits.where("userId").equals(userId).toArray())
    .filter((habit) => habit.deletedAt === null)
    .sort((a, b) => a.sort - b.sort);
}

export function useHabits(userId: string) {
  return useLiveQuery(() => activeHabits(userId), [userId]);
}

export type HabitBoard = {
  today: string;
  cards: HabitCard[];
  planned: number;
  done: number;
  bestStreak: number;
  vacation: boolean;
};

export async function readBoard(userId: string, today = dateKey()): Promise<HabitBoard> {
  const prefs = await getPrefs(userId);
  const habits = await activeHabits(userId);
  const logs = await db.habitLogs.where("userId").equals(userId).toArray();
  const weekKeys = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const cards = habits.map((habit): HabitCard => {
    const own = logs.filter((log) => log.habitId === habit.id);
    const byKey = new Map(own.map((log) => [log.dateKey, log]));
    const doneSet = new Set(own.filter((log) => logDone(habit, log)).map((log) => log.dateKey));
    const lastDone = [...doneSet].sort().at(-1) ?? null;
    const rules = rulesFor(habit, prefs, lastDone);
    const todayLog = byKey.get(today);
    const last30 = keysBetween(addDays(today, -29), today).filter(
      (key) => key >= habit.createdAt.slice(0, 10) && isPlanned(habit, key) && !isVacation(prefs, key),
    );
    const hit30 = last30.filter((key) => doneSet.has(key)).length;
    return {
      ...habit,
      target: targetOf(habit),
      count: todayLog?.count ?? 0,
      doneToday: doneSet.has(today),
      minToday: todayLog?.kind === "min",
      plannedToday: isPlanned(habit, today),
      streak: currentStreak(doneSet, today, rules),
      best: longestStreak(doneSet, today, rules),
      week: weekKeys.map((key) => ({ key, state: stateOf(habit, byKey.get(key), key, today, prefs) })),
      rate30: last30.length ? hit30 / last30.length : 0,
    };
  });
  const plannedCards = cards.filter((card) => card.plannedToday || card.doneToday);
  return {
    today,
    cards,
    planned: plannedCards.length,
    done: plannedCards.filter((card) => card.doneToday).length,
    bestStreak: cards.reduce((max, card) => Math.max(max, card.streak), 0),
    vacation: isVacation(prefs, today),
  };
}

export function useHabitBoard(userId: string) {
  const today = dateKey();
  return useLiveQuery(() => readBoard(userId, today), [userId, today]);
}

export type HabitStory = {
  habit: Habit;
  card: HabitCard;
  total: number;
  cells: Array<{ key: string; state: DayState }>;
  logs: HabitLog[];
};

export function useHabitStory(userId: string, habitId: string) {
  const today = dateKey();
  return useLiveQuery(async (): Promise<HabitStory | null> => {
    const habit = await db.habits.get(habitId);
    if (!habit || habit.userId !== userId || habit.deletedAt) return null;
    const prefs = await getPrefs(userId);
    const board = await readBoard(userId, today);
    const card = board.cards.find((item) => item.id === habitId);
    if (!card) return null;
    const logs = (await db.habitLogs.where("userId").equals(userId).toArray()).filter((log) => log.habitId === habitId);
    const byKey = new Map(logs.map((log) => [log.dateKey, log]));
    // 18 weeks ending with the current week (Monday-first columns).
    const end = addDays(today, 6 - weekdayOf(today));
    const start = addDays(end, -18 * 7 + 1);
    const cells = keysBetween(start, end).map((key) => ({ key, state: stateOf(habit, byKey.get(key), key, today, prefs) }));
    return { habit, card, total: logs.filter((log) => logDone(habit, log)).length, cells, logs };
  }, [userId, habitId, today]);
}

/** Tap on a habit: counts up toward the target, and a tap on a finished habit clears it. */
export async function tapHabit(userId: string, habitId: string, key = dateKey()): Promise<"done" | "progress" | "cleared"> {
  if (key > dateKey()) return "cleared";
  const habit = await db.habits.get(habitId);
  if (!habit || habit.userId !== userId) return "cleared";
  const target = targetOf(habit);
  const makeup = key < dateKey();
  return db.transaction("rw", db.habitLogs, async () => {
    const existing = await db.habitLogs.where("[habitId+dateKey]").equals([habitId, key]).first();
    if (existing && (logDone(habit, existing) || makeup)) {
      await db.habitLogs.delete(existing.id);
      return "cleared";
    }
    const at = new Date().toISOString();
    if (makeup) {
      await db.habitLogs.add({ id: createId(), userId, habitId, dateKey: key, count: target, kind: "makeup", at });
      return "done";
    }
    const count = (existing?.count ?? 0) + 1;
    if (existing) await db.habitLogs.update(existing.id, { count, kind: "full", at });
    else await db.habitLogs.add({ id: createId(), userId, habitId, dateKey: key, count, kind: "full", at });
    return count >= target ? "done" : "progress";
  });
}

/** Log the "minimum version" for a bad day. */
export async function logMinimum(userId: string, habitId: string, key = dateKey()): Promise<void> {
  const habit = await db.habits.get(habitId);
  if (!habit || habit.userId !== userId) return;
  await db.transaction("rw", db.habitLogs, async () => {
    const existing = await db.habitLogs.where("[habitId+dateKey]").equals([habitId, key]).first();
    const row = { count: 1, kind: "min" as HabitLogKind, at: new Date().toISOString() };
    if (existing) await db.habitLogs.update(existing.id, row);
    else await db.habitLogs.add({ id: createId(), userId, habitId, dateKey: key, ...row });
  });
}

export async function clearHabitDay(userId: string, habitId: string, key = dateKey()): Promise<void> {
  const existing = await db.habitLogs.where("[habitId+dateKey]").equals([habitId, key]).first();
  if (existing?.userId === userId) await db.habitLogs.delete(existing.id);
}

export type HabitDraft = Pick<Habit, "name"> &
  Partial<Pick<Habit, "icon" | "tone" | "days" | "targetCount" | "unit" | "minimum" | "reminder" | "category" | "goalId">>;

export async function createHabit(userId: string, draft: HabitDraft): Promise<string> {
  const current = await db.habits.where("userId").equals(userId).toArray();
  const sort = current.reduce((max, habit) => Math.max(max, habit.sort), 0) + 1;
  const id = createId();
  await db.habits.add({
    id,
    userId,
    name: draft.name.trim(),
    symbol: "leaf",
    sort,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    frequency: draft.days && draft.days.length < 7 ? "custom" : "daily",
    days: draft.days ?? null,
    targetCount: draft.targetCount ?? 1,
    unit: draft.unit ?? null,
    icon: draft.icon ?? "i-sprout",
    tone: draft.tone ?? "mint",
    minimum: draft.minimum?.trim() || null,
    reminder: draft.reminder ?? null,
    category: draft.category ?? null,
    goalId: draft.goalId ?? null,
    vacation: false,
  });
  return id;
}

export async function updateHabit(userId: string, habitId: string, patch: Partial<Omit<Habit, "id" | "userId">>): Promise<void> {
  const habit = await db.habits.get(habitId);
  if (!habit || habit.userId !== userId) return;
  if (patch.days) patch.frequency = patch.days.length < 7 ? "custom" : "daily";
  await db.habits.update(habitId, patch);
}

export async function deleteHabit(userId: string, habitId: string): Promise<void> {
  await updateHabit(userId, habitId, { deletedAt: new Date().toISOString() });
}

export async function moveHabit(userId: string, habitId: string, direction: -1 | 1): Promise<void> {
  const habits = await activeHabits(userId);
  const index = habits.findIndex((habit) => habit.id === habitId);
  const other = habits[index + direction];
  const self = habits[index];
  if (!self || !other) return;
  await db.transaction("rw", db.habits, async () => {
    await db.habits.update(self.id, { sort: other.sort });
    await db.habits.update(other.id, { sort: self.sort });
  });
}
