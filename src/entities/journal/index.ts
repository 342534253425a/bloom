import { useLiveQuery } from "dexie-react-hooks";
import { dateKey } from "@/shared/lib/date";
import { createId } from "@/shared/lib/id";
import { db, type JournalEntry, type JournalKind, type Review, type ReviewKind } from "@/shared/db";

export const failureReasons = ["tired", "tooBig", "noTime", "forgot", "mood", "unclear", "distracted", "other"] as const;
export const avoidReasons = ["tooBig", "boring", "unclear", "fear", "tired", "distracted", "perfect"] as const;

export function useEntries(userId: string, kinds: JournalKind[]) {
  const signature = kinds.join(",");
  return useLiveQuery(async () => {
    const rows = await db.journalEntries.where("userId").equals(userId).toArray();
    return rows.filter((row) => kinds.includes(row.kind)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [userId, signature]);
}

export async function addEntry(
  userId: string,
  kind: JournalKind,
  fields: Pick<JournalEntry, "body"> & Partial<Pick<JournalEntry, "title" | "tags" | "extra" | "extra2" | "dateKey">>,
) {
  const body = fields.body.trim();
  if (!body) return;
  await db.journalEntries.add({
    id: createId(),
    userId,
    kind,
    body,
    title: fields.title?.trim() || null,
    tags: fields.tags ?? null,
    extra: fields.extra?.trim() || null,
    extra2: fields.extra2?.trim() || null,
    dateKey: fields.dateKey ?? dateKey(),
    createdAt: new Date().toISOString(),
  });
}

export async function updateEntry(userId: string, id: string, patch: Partial<Pick<JournalEntry, "body" | "title" | "extra" | "extra2" | "tags">>) {
  const row = await db.journalEntries.get(id);
  if (row?.userId === userId) await db.journalEntries.update(id, patch);
}

export async function removeEntry(userId: string, id: string) {
  const row = await db.journalEntries.get(id);
  if (row?.userId === userId) await db.journalEntries.delete(id);
}

export function useReview(userId: string, kind: ReviewKind, periodKey: string) {
  return useLiveQuery(
    async () => (await db.reviews.where("[userId+kind+periodKey]").equals([userId, kind, periodKey]).first()) ?? null,
    [userId, kind, periodKey],
  );
}

export function useReviews(userId: string) {
  return useLiveQuery(async () => {
    const rows = await db.reviews.where("userId").equals(userId).toArray();
    return rows.sort((a, b) => b.periodKey.localeCompare(a.periodKey));
  }, [userId]);
}

export type ReviewFields = Pick<Review, "wentWell" | "wasHard" | "nextStep"> & Partial<Pick<Review, "keep" | "drop">>;

export async function saveReview(userId: string, kind: ReviewKind, periodKey: string, fields: ReviewFields) {
  const existing = await db.reviews.where("[userId+kind+periodKey]").equals([userId, kind, periodKey]).first();
  if (existing) {
    await db.reviews.update(existing.id, fields);
    return;
  }
  await db.reviews.add({ id: createId(), userId, kind, periodKey, ...fields });
}
