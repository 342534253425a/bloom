import { useLiveQuery } from "dexie-react-hooks";
import { addDays, dateKey, keysBetween } from "@/shared/lib/date";
import { createId } from "@/shared/lib/id";
import { db, type Day, type Mood } from "@/shared/db";

export const moods: Mood[] = ["happy", "calm", "okay", "tired", "anxious", "sad"];
export const moodScore: Record<Mood, number> = { happy: 5, calm: 4, okay: 3, tired: 2, anxious: 2, sad: 1 };
export const stressSources = ["work", "study", "sleep", "people", "health", "money", "family", "future", "noise"] as const;

export type DayPatch = Partial<Omit<Day, "id" | "userId" | "dateKey" | "updatedAt">>;

export function useDay(userId: string, key = dateKey()) {
  return useLiveQuery(async () => (await db.days.where("[userId+dateKey]").equals([userId, key]).first()) ?? null, [userId, key]);
}

export async function saveDay(userId: string, patch: DayPatch, key = dateKey()): Promise<void> {
  const updatedAt = new Date().toISOString();
  const withTime = patch.mood ? { ...patch, moodAt: updatedAt } : patch;
  await db.transaction("rw", db.days, async () => {
    const existing = await db.days.where("[userId+dateKey]").equals([userId, key]).first();
    if (existing) {
      await db.days.update(existing.id, { ...withTime, updatedAt });
      return;
    }
    await db.days.add({ id: createId(), userId, dateKey: key, ...withTime, updatedAt });
  });
}

/** Days between two keys, with gaps filled by `null`. */
export function useDays(userId: string, from: string, to: string) {
  return useLiveQuery(async () => {
    const rows = await db.days.where("userId").equals(userId).toArray();
    const byKey = new Map(rows.map((row) => [row.dateKey, row]));
    return keysBetween(from, to).map((key) => ({ key, day: byKey.get(key) ?? null }));
  }, [userId, from, to]);
}

export function useRecentDays(userId: string, count: number) {
  const today = dateKey();
  return useDays(userId, addDays(today, -(count - 1)), today);
}

export function useAllDays(userId: string) {
  return useLiveQuery(async () => {
    const rows = await db.days.where("userId").equals(userId).toArray();
    return rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [userId]);
}

/** Cycle helper: start keys of each period (first period day after a gap of 10+ days). */
export function periodStarts(days: Day[]): string[] {
  const flow = days.filter((day) => (day.period ?? 0) > 0).map((day) => day.dateKey).sort();
  const starts: string[] = [];
  let previous: string | null = null;
  for (const key of flow) {
    if (!previous || keysBetween(previous, key).length > 10) starts.push(key);
    previous = key;
  }
  return starts;
}
