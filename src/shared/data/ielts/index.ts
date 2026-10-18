import { wordsA } from "./a";
import { wordsB } from "./b";
import { wordsC } from "./c";
import { wordsD } from "./d";
import { wordsE } from "./e";
import { wordsF } from "./f";
import { wordsG } from "./g";
import { wordsH } from "./h";
import type { IeltsLevel, IeltsWord } from "./types";

export type { IeltsLevel, IeltsWord };

export interface Word {
  id: string;
  word: string;
  pos: string;
  level: IeltsLevel;
  zh: string;
  definition: string;
  example: string;
}

const slug = (w: string) => w.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

/** All IELTS words, merged and de-duplicated, sorted alphabetically. */
export const ieltsWords: Word[] = (() => {
  const seen = new Set<string>();
  const out: Word[] = [];
  for (const [word, pos, level, zh, definition, example] of [
    ...wordsA, ...wordsB, ...wordsC, ...wordsD, ...wordsE, ...wordsF, ...wordsG, ...wordsH,
  ]) {
    const id = slug(word);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, word, pos, level, zh, definition, example });
  }
  return out.sort((a, b) => a.word.localeCompare(b.word));
})();

export const wordById = new Map(ieltsWords.map((w) => [w.id, w]));

/** Finds the headword (or its inflected form) inside the example so games can blank it out. */
export function findInExample(w: Word): { start: number; end: number } | null {
  const text = w.example.toLowerCase();
  const head = w.word.toLowerCase();
  let i = text.indexOf(head);
  if (i >= 0) return { start: i, end: i + head.length + (text.slice(i + head.length).match(/^[a-z]*/)?.[0].length ?? 0) };
  const first = head.split(" ")[0];
  const stem = first.replace(/(e|y|ise|ize)$/, "");
  const re = new RegExp(`\\b${stem.slice(0, Math.max(3, stem.length))}[a-z]*`, "i");
  const m = re.exec(w.example);
  if (!m) return null;
  i = m.index;
  return { start: i, end: i + m[0].length };
}
