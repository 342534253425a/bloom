import { useLiveQuery } from "dexie-react-hooks";
import { db, type VocabCard } from "@/shared/db";
import { ieltsWords, type IeltsLevel, type Word } from "@/shared/data/ielts";

/** Days until the next review for each Leitner box. */
const intervals = [0, 1, 3, 7, 14, 30, 60];
export const masteredBox = 6;

export function cardId(userId: string, wordId: string) {
  return `${userId}:${wordId}`;
}

export function useVocab(userId: string | undefined) {
  return (
    useLiveQuery(async () => {
      if (!userId) return new Map<string, VocabCard>();
      const rows = await db.vocab.where("userId").equals(userId).toArray();
      return new Map(rows.map((row) => [row.wordId, row]));
    }, [userId]) ?? new Map<string, VocabCard>()
  );
}

/** Records one answer: right moves the word up a box, wrong sends it back to the start. */
export async function grade(userId: string, wordId: string, ok: boolean, strength: "hard" | "good" | "easy" = "good") {
  const id = cardId(userId, wordId);
  const now = new Date();
  const prev = await db.vocab.get(id);
  const from = prev?.box ?? 0;
  const box = ok ? Math.min(masteredBox, from + (strength === "easy" ? 2 : strength === "hard" ? 0 : 1)) : 0;
  const due = new Date(now.getTime() + (ok ? Math.max(intervals[box], strength === "hard" ? 1 : 0) * 86_400_000 : 10 * 60_000));
  const row: VocabCard = {
    id,
    userId,
    wordId,
    box,
    due: due.toISOString(),
    right: (prev?.right ?? 0) + (ok ? 1 : 0),
    wrong: (prev?.wrong ?? 0) + (ok ? 0 : 1),
    spoken: prev?.spoken,
    updatedAt: now.toISOString(),
  };
  await db.vocab.put(row);
  return row;
}

export async function markSpoken(userId: string, wordId: string) {
  const id = cardId(userId, wordId);
  const prev = await db.vocab.get(id);
  const now = new Date().toISOString();
  await db.vocab.put(prev ? { ...prev, spoken: true, updatedAt: now } : { id, userId, wordId, box: 0, due: now, right: 0, wrong: 0, spoken: true, updatedAt: now });
}

export type LevelFilter = IeltsLevel | "all";

export function poolFor(level: LevelFilter): Word[] {
  return level === "all" ? ieltsWords : ieltsWords.filter((w) => w.level === level);
}

export function stats(cards: Map<string, VocabCard>, level: LevelFilter) {
  const pool = poolFor(level);
  const now = Date.now();
  let learning = 0;
  let mastered = 0;
  let due = 0;
  let spoken = 0;
  for (const w of pool) {
    const c = cards.get(w.id);
    if (!c) continue;
    if (c.box >= 4) mastered += 1;
    else learning += 1;
    if (Date.parse(c.due) <= now) due += 1;
    if (c.spoken) spoken += 1;
  }
  return { total: pool.length, learning, mastered, due, spoken, fresh: pool.length - learning - mastered };
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export { shuffle };

/**
 * Words for one round: first everything due, then words still being learned, then new ones,
 * so every game doubles as spaced repetition.
 */
export function pickRound(cards: Map<string, VocabCard>, level: LevelFilter, size: number, filter?: (w: Word) => boolean): Word[] {
  const pool = poolFor(level).filter((w) => !filter || filter(w));
  const now = Date.now();
  const due: Word[] = [];
  const learning: Word[] = [];
  const fresh: Word[] = [];
  for (const w of pool) {
    const c = cards.get(w.id);
    if (!c) fresh.push(w);
    else if (Date.parse(c.due) <= now) due.push(w);
    else if (c.box < 4) learning.push(w);
  }
  const ordered = [...shuffle(due), ...shuffle(learning).slice(0, Math.ceil(size / 3)), ...shuffle(fresh)];
  const out: Word[] = [];
  const seen = new Set<string>();
  for (const w of ordered) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    out.push(w);
    if (out.length >= size) break;
  }
  if (out.length < size) for (const w of shuffle(pool)) if (!seen.has(w.id) && out.length < size) out.push(w);
  return shuffle(out);
}

/** Wrong options of the same part of speech so the right answer can't be guessed from grammar. */
export function distractors(word: Word, count: number): Word[] {
  const same = ieltsWords.filter((w) => w.id !== word.id && w.pos === word.pos && !w.word.includes(" ") === !word.word.includes(" "));
  return shuffle(same.length >= count ? same : ieltsWords.filter((w) => w.id !== word.id)).slice(0, count);
}
