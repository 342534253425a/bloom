import { db } from "@/shared/db";
import { dateKey, addDays } from "@/shared/lib/date";
import { createId } from "@/shared/lib/id";
import { getCouple, getItem, myId, putItem, removeItem, signal, useCouple, useItem, useItems, type CoupleItem } from "./link";

export * from "./link";

/* ---------- Effects ("thinking of you") ---------- */

export type EffectData = { effect: string; text: string | null; emoji: string | null; to: string; seen: boolean };

export async function sendEffect(effect: string, text: string | null = null, emoji: string | null = null) {
  const partner = getCouple().partner;
  if (!partner) return;
  const id = `fx:${createId()}`;
  const data: EffectData = { effect, text: text?.trim() || null, emoji, to: partner.id, seen: false };
  await signal("effect", { id, ...data });
  await putItem(id, "effect", data);
}

export async function markEffectSeen(id: string) {
  const item = getItem<EffectData>(id);
  if (item && !item.data.seen) await putItem(id, "effect", { ...item.data, seen: true });
}

/* ---------- Chat ---------- */

export type VoiceAttachment = { path: string; duration: number; mime: string };
export type PhotoAttachment = { path: string; width: number; height: number };

export type MessageData = {
  text: string | null;
  sticker: string | null;
  reactions: Record<string, string>;
  replyTo?: string | null;
  edited?: string | null;
  pinned?: string | null;
  voice?: VoiceAttachment | null;
  photo?: PhotoAttachment | null;
};

/** Messages ordered the way the server received them (phone clocks in two countries can disagree). */
export function messageOrder(a: CoupleItem<MessageData>, b: CoupleItem<MessageData>) {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

export async function sendMessage(
  text: string | null,
  extra: Partial<Pick<MessageData, "sticker" | "replyTo" | "voice" | "photo">> = {},
) {
  const body = text?.trim() || null;
  if (!body && !extra.sticker && !extra.voice && !extra.photo) return;
  const id = `msg:${createId()}`;
  await putItem(id, "msg", {
    text: body,
    sticker: extra.sticker ?? null,
    reactions: {},
    replyTo: extra.replyTo ?? null,
    voice: extra.voice ?? null,
    photo: extra.photo ?? null,
  } satisfies MessageData);
  void signal("typing", { typing: false });
}

export async function editMessage(id: string, text: string) {
  const item = getItem<MessageData>(id);
  if (!item || !text.trim() || item.author !== myId()) return;
  await putItem(id, "msg", { ...item.data, text: text.trim(), edited: new Date().toISOString() });
}

export async function togglePin(id: string) {
  const item = getItem<MessageData>(id);
  if (!item) return;
  await putItem(id, "msg", { ...item.data, pinned: item.data.pinned ? null : new Date().toISOString() });
}

export async function toggleReaction(id: string, emoji: string) {
  const me = myId();
  const item = getItem<MessageData>(id);
  if (!me || !item) return;
  const reactions = { ...(item.data.reactions ?? {}) };
  if (reactions[me] === emoji) delete reactions[me];
  else reactions[me] = emoji;
  await putItem(id, "msg", { ...item.data, reactions });
}

export async function deleteMessage(id: string) {
  await removeItem(id);
}

/** Remembers the server time of the newest message this person has seen. */
export async function markRead(seenAt: string) {
  const me = myId();
  if (!me) return;
  const current = getItem<{ seen?: string }>(`read:${me}`);
  if (current?.data.seen && current.data.seen >= seenAt) return;
  await putItem(`read:${me}`, "read", { seen: seenAt, at: new Date().toISOString() });
}

export function useUnread(): number {
  const messages = useItems<MessageData>("msg");
  const me = useCouple().me?.id;
  const read = useItem<{ seen?: string }>(`read:${me ?? ""}`);
  if (!me) return 0;
  const seen = read?.data.seen ?? "";
  return messages.filter((message) => message.author !== me && message.created_at > seen).length;
}

/* ---------- Daily summaries (feed the shared garden and partner view) ---------- */

export type DaySummary = { done: number; planned: number; focus: number; mood: string | null };

export async function publishDay(summary: DaySummary, key = dateKey()) {
  const me = myId();
  if (!me || !getCouple().me?.couple_key) return;
  const id = `day:${me}:${key}`;
  const existing = getItem<DaySummary>(id);
  if (existing && JSON.stringify(existing.data) === JSON.stringify(summary)) return;
  await putItem(id, "day", summary);
}

export function useDaySummaries() {
  return useItems<DaySummary>("day");
}

/* ---------- Shared garden ---------- */

export type GardenData = { waters: number; lastBy: string | null; lastAt: string | null; name: string };

/** Each watering costs more than the last; partners take turns. */
export function waterCost(waters: number) {
  return 20 + waters * 10;
}

export type WaterCheck = { ok: true; cost: number } | { ok: false; reason: "turn" | "points"; cost: number };

export function canWater(balance: number): WaterCheck {
  const current = getItem<GardenData>("garden");
  const cost = waterCost(current?.data.waters ?? 0);
  if (current?.data.lastBy && current.data.lastBy === myId()) return { ok: false, reason: "turn", cost };
  if (balance < cost) return { ok: false, reason: "points", cost };
  return { ok: true, cost };
}

/** Spends your own points (recorded like a redeemed reward) and waters the shared plant. */
export async function waterTogether(balance: number): Promise<WaterCheck> {
  const me = myId();
  const check = canWater(balance);
  if (!me || !check.ok) return check;
  await db.redemptions.add({ id: createId(), userId: me, rewardId: "garden-water", cost: check.cost, createdAt: new Date().toISOString() });
  const current = getItem<GardenData>("garden");
  await putItem("garden", "garden", {
    waters: (current?.data.waters ?? 0) + 1,
    lastBy: me,
    lastAt: new Date().toISOString(),
    name: current?.data.name ?? "",
  } satisfies GardenData);
  return check;
}

export async function renameGarden(name: string) {
  const current = getItem<GardenData>("garden");
  await putItem("garden", "garden", { waters: current?.data.waters ?? 0, lastBy: current?.data.lastBy ?? null, lastAt: current?.data.lastAt ?? null, name: name.trim() });
}

/** Points from both people's days: every habit done counts, every day you both finish everything blooms a flower. */
export function gardenScore(days: Array<CoupleItem<DaySummary>>, meId: string, partnerId: string, waters: number) {
  const byDate = new Map<string, { me?: DaySummary; partner?: DaySummary }>();
  for (const item of days) {
    const [, owner, date] = item.id.split(":");
    if (!date) continue;
    const slot = byDate.get(date) ?? {};
    if (owner === meId) slot.me = item.data;
    if (owner === partnerId) slot.partner = item.data;
    byDate.set(date, slot);
  }
  let points = waters * 2;
  const flowers: string[] = [];
  for (const [date, slot] of byDate) {
    points += ((slot.me?.done ?? 0) + (slot.partner?.done ?? 0)) * 10;
    const full = (day?: DaySummary) => Boolean(day && day.planned > 0 && day.done >= day.planned);
    if (full(slot.me) && full(slot.partner)) {
      flowers.push(date);
      points += 50;
    }
  }
  return { points, flowers: flowers.sort() };
}

/* ---------- Focus together: one shared timer ---------- */

export type FocusData = {
  phase: "idle" | "focus" | "break";
  startedAt: string | null;
  minutes: number;
  breakMinutes: number;
  by: string | null;
  label: string | null;
  /** Milliseconds left while paused; null while running. */
  pausedLeft?: number | null;
  /** Session id so each device logs a finished session only once. */
  session?: string | null;
};

const idleFocus: FocusData = { phase: "idle", startedAt: null, minutes: 25, breakMinutes: 5, by: null, label: null, pausedLeft: null, session: null };

export function sharedRemaining(data: FocusData | undefined | null, now = Date.now()): number {
  if (!data || data.phase === "idle") return 0;
  const total = (data.phase === "break" ? data.breakMinutes : data.minutes) * 60_000;
  if (data.pausedLeft != null) return data.pausedLeft;
  if (!data.startedAt) return total;
  return Math.max(0, total - (now - new Date(data.startedAt).getTime()));
}

function currentFocus(): FocusData {
  return { ...idleFocus, ...(getItem<FocusData>("focus")?.data ?? {}) };
}

export async function startTogether(minutes: number, breakMinutes: number, label: string | null) {
  await putItem("focus", "focus", { phase: "focus", startedAt: new Date().toISOString(), minutes, breakMinutes, by: myId(), label, pausedLeft: null, session: createId() } satisfies FocusData);
  void signal("focus", { phase: "focus" });
}

export async function pauseTogether() {
  const current = currentFocus();
  if (current.phase === "idle" || current.pausedLeft != null) return;
  await putItem("focus", "focus", { ...current, pausedLeft: sharedRemaining(current), by: myId() });
}

export async function resumeTogether() {
  const current = currentFocus();
  if (current.phase === "idle" || current.pausedLeft == null) return;
  const total = (current.phase === "break" ? current.breakMinutes : current.minutes) * 60_000;
  const startedAt = new Date(Date.now() - (total - current.pausedLeft)).toISOString();
  await putItem("focus", "focus", { ...current, startedAt, pausedLeft: null, by: myId() });
}

export async function startTogetherBreak() {
  const current = currentFocus();
  await putItem("focus", "focus", { ...current, phase: "break", startedAt: new Date().toISOString(), pausedLeft: null, by: myId(), session: createId() });
}

/** Ends the shared timer. Focus minutes are logged once as a shared session that both devices record. */
export async function stopTogether(logMinutes: number) {
  const current = currentFocus();
  if (logMinutes >= 1 && current.phase === "focus") {
    await putItem(`focuslog:${current.session ?? createId()}`, "focuslog", { minutes: logMinutes, at: new Date().toISOString(), label: current.label ?? null });
  }
  await putItem("focus", "focus", { ...current, phase: "idle", startedAt: null, pausedLeft: null, by: myId() });
}

/* ---------- Pair habits ---------- */

export type PairHabit = { title: string; icon: string; createdBy: string };

export async function addPairHabit(title: string, icon: string) {
  if (!title.trim()) return;
  await putItem(`ph:${createId()}`, "phabit", { title: title.trim(), icon, createdBy: myId() ?? "" } satisfies PairHabit);
}

export async function removePairHabit(id: string) {
  await removeItem(id);
}

export async function togglePairCheck(habitId: string, key = dateKey()) {
  const me = myId();
  if (!me) return;
  const id = `pc:${habitId}:${me}:${key}`;
  if (getItem(id)) await removeItem(id);
  else await putItem(id, "pcheck", { habit: habitId, date: key });
}

export function pairStreak(habitId: string, checks: Array<CoupleItem>, meId: string, partnerId: string) {
  const both = (key: string) => checks.some((item) => item.id === `pc:${habitId}:${meId}:${key}`) && checks.some((item) => item.id === `pc:${habitId}:${partnerId}:${key}`);
  let cursor = dateKey();
  let streak = 0;
  if (!both(cursor)) cursor = addDays(cursor, -1);
  while (both(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/* ---------- Question of the day ---------- */

export async function answerQuestion(question: number, text: string, key = dateKey()) {
  const me = myId();
  if (!me || !text.trim()) return;
  await putItem(`qa:${key}:${me}`, "answer", { q: question, text: text.trim(), date: key });
}

export function questionIndex(key: string, total: number) {
  const [y, m, d] = key.split("-").map(Number);
  const days = Math.floor(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86_400_000);
  return days % total;
}

/* ---------- Watch-together settings shared by both ---------- */

export type TurnData = { urls: string; username: string; credential: string };

export async function saveTurn(data: TurnData) {
  await putItem("turn", "settings", data);
}
