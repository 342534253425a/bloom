import { chineseStarter } from "@/shared/data/chinese-starter";
import { createId } from "@/shared/lib/id";
import { removeCoupleFile, uploadCoupleFile, type Recording } from "@/shared/lib/media";
import { getCouple, getItem, myId, putItem, removeItem, type CoupleItem } from "./link";

/**
 * A shared phrasebook: each card has text (hanzi + pinyin + meaning) and one voice recording per partner.
 * The partner listens and rates: good / almost / wrong, with an optional note.
 */

export type Card = { id: string; hanzi: string; pinyin: string; ru: string; en: string; deck: string; custom: boolean; author?: string };
export type CardData = { hanzi: string; pinyin: string; meaning: string; deck: string };
export type RecordingData = { card: string; path: string; duration: number; at: string };
export type Verdict = "good" | "almost" | "wrong";
export type RatingData = { card: string; verdict: Verdict; note: string | null; at: string; recAt: string };

export function starterCards(): Card[] {
  return Object.entries(chineseStarter).flatMap(([deck, value]) =>
    value.cards.map(([hanzi, pinyin, ru, en], index) => ({ id: `s:${deck}:${index}`, hanzi, pinyin, ru, en, deck, custom: false })),
  );
}

export function customCards(items: Array<CoupleItem<CardData>>): Card[] {
  return items.map((item) => ({ id: item.id, hanzi: item.data.hanzi, pinyin: item.data.pinyin, ru: item.data.meaning, en: item.data.meaning, deck: item.data.deck || "mine", custom: true, author: item.author }));
}

export async function addCard(hanzi: string, pinyin: string, meaning: string, deck = "mine") {
  if (!hanzi.trim()) return;
  await putItem(`cn:${createId()}`, "cn", { hanzi: hanzi.trim(), pinyin: pinyin.trim(), meaning: meaning.trim(), deck } satisfies CardData);
}

export async function removeCard(id: string) {
  await removeItem(id);
}

export function recordingId(cardId: string, userId: string) {
  return `cnrec:${cardId}:${userId}`;
}

export function ratingId(cardId: string, recorderId: string) {
  return `cnrate:${cardId}:${recorderId}`;
}

/** Replaces this person's recording for the card (the old file is deleted). */
export async function saveRecording(cardId: string, recording: Recording) {
  const me = myId();
  const key = getCouple().me?.couple_key;
  if (!me || !key) return;
  const path = await uploadCoupleFile(key, "phrasebook", recording.blob);
  const old = getItem<RecordingData>(recordingId(cardId, me));
  await putItem(recordingId(cardId, me), "cnrec", { card: cardId, path, duration: recording.duration, at: new Date().toISOString() } satisfies RecordingData);
  if (old?.data.path) void removeCoupleFile(old.data.path);
}

export async function rateRecording(cardId: string, recorderId: string, verdict: Verdict, note: string | null) {
  const rec = getItem<RecordingData>(recordingId(cardId, recorderId));
  if (!rec) return;
  await putItem(ratingId(cardId, recorderId), "cnrate", { card: cardId, verdict, note: note?.trim() || null, at: new Date().toISOString(), recAt: rec.data.at } satisfies RatingData);
}
