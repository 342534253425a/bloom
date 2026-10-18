import { useLiveQuery } from "dexie-react-hooks";
import { dateKey, addDays } from "@/shared/lib/date";
import { createId } from "@/shared/lib/id";
import { db, type BoardNote, type Preferences, type ShareMode, type ShareModule, type Sharing } from "@/shared/db";

export type Prefs = Required<Omit<Preferences, "vacationFrom" | "heightCm">> & {
  vacationFrom: string | null;
  heightCm: number | null;
};

export const defaultPrefs: Omit<Prefs, "id"> = {
  weekStart: "monday",
  units: "metric",
  calmTheme: false,
  offline: true,
  theme: "bloom",
  accent: "mint",
  onboarded: false,
  petName: "Bloomie",
  waterGoal: 8,
  sleepGoal: 8,
  consequence: "minimum",
  donateAmount: 10,
  notify: false,
  morning: "08:30",
  evening: "21:30",
  missed: "18:00",
  quietFrom: "23:00",
  quietTo: "08:00",
  snooze: 15,
  morningOn: true,
  eveningOn: true,
  missedOn: false,
  quietOn: true,
  vacationFrom: null,
  vacations: [],
  cycleLength: 28,
  heightCm: null,
  focusMinutes: 25,
  breakMinutes: 5,
  tours: "on",
  toursSeen: [],
  notifyOff: [],
  notifyTimes: {},
  waterEvery: 2,
};

export function mergePrefs(userId: string, row: Preferences | undefined | null): Prefs {
  const clean = Object.fromEntries(Object.entries(row ?? {}).filter(([, value]) => value !== undefined));
  return { ...defaultPrefs, ...clean, id: userId } as Prefs;
}

export async function getPrefs(userId: string): Promise<Prefs> {
  return mergePrefs(userId, await db.preferences.get(userId));
}

export function usePrefs(userId: string): Prefs | undefined {
  return useLiveQuery(() => getPrefs(userId), [userId]);
}

export async function savePrefs(userId: string, patch: Partial<Omit<Prefs, "id">>): Promise<void> {
  const current = await getPrefs(userId);
  await db.preferences.put({ ...current, ...patch, id: userId });
}

/** True when the day sits inside a vacation range (or the ongoing vacation). */
export function isVacation(prefs: Pick<Prefs, "vacations" | "vacationFrom">, key: string): boolean {
  if (prefs.vacationFrom && key >= prefs.vacationFrom) return true;
  return prefs.vacations.some((range) => key >= range.from && key <= range.to);
}

export async function setVacation(userId: string, on: boolean): Promise<void> {
  const prefs = await getPrefs(userId);
  const today = dateKey();
  if (on) {
    if (!prefs.vacationFrom) await savePrefs(userId, { vacationFrom: today });
    return;
  }
  if (!prefs.vacationFrom) return;
  const to = addDays(today, -1);
  const vacations = to >= prefs.vacationFrom ? [...prefs.vacations, { from: prefs.vacationFrom, to }] : prefs.vacations;
  await savePrefs(userId, { vacationFrom: null, vacations });
}

/* ---------- Sharing ---------- */

export const shareModules: ShareModule[] = ["goals", "habits", "streaks", "tasks", "focus", "mood", "body", "journal"];
/** Modules that stay private no matter which mode is picked. */
export const alwaysPrivate: ShareModule[] = ["journal"];

export type ShareState = { mode: ShareMode; modules: Record<ShareModule, boolean>; paused: boolean };

const modePresets: Record<ShareMode, ShareModule[]> = {
  private: [],
  partial: ["goals", "habits", "streaks"],
  partner: ["goals", "habits", "streaks", "tasks", "focus"],
};

function presetModules(mode: ShareMode): Record<ShareModule, boolean> {
  return Object.fromEntries(shareModules.map((key) => [key, modePresets[mode].includes(key)])) as Record<ShareModule, boolean>;
}

function readShare(row: Sharing | undefined): ShareState {
  const mode = row?.mode ?? "private";
  return {
    mode,
    modules: { ...presetModules(mode), ...(row?.modules ?? {}), journal: false },
    paused: row?.paused ?? false,
  };
}

export function useSharing(userId: string) {
  return useLiveQuery(async () => readShare(await db.sharing.get(userId)), [userId]);
}

export async function setShareMode(userId: string, mode: ShareMode) {
  const current = readShare(await db.sharing.get(userId));
  await db.sharing.put({ id: userId, mode, modules: presetModules(mode), paused: current.paused });
}

export async function setShareModule(userId: string, module: ShareModule, on: boolean) {
  if (alwaysPrivate.includes(module)) return;
  const current = readShare(await db.sharing.get(userId));
  const modules = { ...current.modules, [module]: on };
  const anyOn = Object.values(modules).some(Boolean);
  const mode: ShareMode = !anyOn ? "private" : current.mode === "private" ? "partial" : current.mode;
  await db.sharing.put({ id: userId, mode, modules, paused: current.paused });
}

export async function setSharePaused(userId: string, paused: boolean) {
  const current = readShare(await db.sharing.get(userId));
  await db.sharing.put({ id: userId, mode: current.mode, modules: current.modules, paused });
}

/* ---------- Partner & board ---------- */

export function usePartner(userId: string) {
  return useLiveQuery(async () => (await db.partners.get(userId)) ?? null, [userId]);
}

export async function savePartner(userId: string, name: string) {
  const existing = await db.partners.get(userId);
  await db.partners.put({
    id: userId,
    name: name.trim(),
    since: existing?.since ?? dateKey(),
    paused: existing?.paused ?? false,
  });
}

export async function removePartner(userId: string) {
  await db.partners.delete(userId);
}

export function useNotes(userId: string) {
  return useLiveQuery(async () => {
    const rows = await db.notes.where("userId").equals(userId).toArray();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [userId]);
}

export async function addNote(userId: string, author: BoardNote["author"], body: string, replyTo: string | null = null) {
  const trimmed = body.trim();
  if (!trimmed) return;
  await db.notes.add({ id: createId(), userId, author, body: trimmed, replyTo, createdAt: new Date().toISOString() });
}

export async function removeNote(userId: string, id: string) {
  const row = await db.notes.get(id);
  if (row?.userId === userId) await db.notes.delete(id);
}
