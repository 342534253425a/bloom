import { useSyncExternalStore } from "react";
import type { Prefs } from "@/entities/prefs";
import { kindById, notifyKinds, type NotifyKind } from "@/shared/config/notifications";
import type { PushSnapshot } from "@/shared/lib/push";

/* ------------------------------------------------------------------ settings */

const legacyOn: Record<string, "morningOn" | "eveningOn" | "missedOn"> = { morning: "morningOn", evening: "eveningOn", missed: "missedOn" };
const legacyTime: Record<string, "morning" | "evening" | "missed"> = { morning: "morning", evening: "evening", missed: "missed" };

export function kindOn(prefs: Prefs, id: string): boolean {
  if (legacyOn[id]) return Boolean(prefs[legacyOn[id]]);
  const kind = kindById.get(id);
  const off = prefs.notifyOff ?? [];
  // Opt-in kinds are stored the other way round: listed in notifyOff as "+id" when switched on.
  if (kind?.optIn) return off.includes(`+${id}`);
  return !off.includes(id);
}

export function kindTime(prefs: Prefs, id: string): string {
  if (legacyTime[id]) return prefs[legacyTime[id]];
  return prefs.notifyTimes?.[id] ?? kindById.get(id)?.time ?? "09:00";
}

/** The patch that switches one kind on or off, for savePrefs. */
export function togglePatch(prefs: Prefs, id: string, on: boolean): Partial<Prefs> {
  if (legacyOn[id]) return { [legacyOn[id]]: on } as Partial<Prefs>;
  const kind = kindById.get(id);
  const off = new Set(prefs.notifyOff ?? []);
  if (kind?.optIn) {
    if (on) off.add(`+${id}`);
    else off.delete(`+${id}`);
  } else if (on) off.delete(id);
  else off.add(id);
  return { notifyOff: [...off] };
}

export function timePatch(prefs: Prefs, id: string, time: string): Partial<Prefs> {
  if (legacyTime[id]) return { [legacyTime[id]]: time } as Partial<Prefs>;
  return { notifyTimes: { ...(prefs.notifyTimes ?? {}), [id]: time } };
}

function minutesOf(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function inQuiet(prefs: Pick<Prefs, "quietOn" | "quietFrom" | "quietTo">, now = new Date()): boolean {
  if (!prefs.quietOn) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const from = minutesOf(prefs.quietFrom);
  const to = minutesOf(prefs.quietTo);
  return from <= to ? current >= from && current < to : current >= from || current < to;
}

/* ------------------------------------------------------------------ inbox */

export type InboxItem = { id: string; kind: string; title: string; body: string; to: string; at: string; read: boolean };

let owner = "";
let inbox: InboxItem[] = [];
const listeners = new Set<() => void>();
const key = () => `bloom.inbox.${owner}`;

function load(userId: string) {
  if (owner === userId) return;
  owner = userId;
  try {
    inbox = JSON.parse(localStorage.getItem(key()) ?? "[]") as InboxItem[];
  } catch {
    inbox = [];
  }
  emit();
}

function save() {
  try {
    localStorage.setItem(key(), JSON.stringify(inbox.slice(0, 120)));
  } catch {
    /* storage may be unavailable */
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function useInbox(userId: string): InboxItem[] {
  load(userId);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => inbox,
  );
}

export function markAllRead() {
  inbox = inbox.map((item) => (item.read ? item : { ...item, read: true }));
  save();
  emit();
}

export function clearInbox() {
  inbox = [];
  save();
  emit();
}

/* ------------------------------------------------------------------ delivery */

export type Banner = { id: string; kind: NotifyKind | undefined; title: string; body: string; to: string };
let banner: Banner | null = null;
const bannerListeners = new Set<() => void>();

export function useBanner(): Banner | null {
  return useSyncExternalStore(
    (listener) => {
      bannerListeners.add(listener);
      return () => bannerListeners.delete(listener);
    },
    () => banner,
  );
}

export function dismissBanner() {
  banner = null;
  for (const listener of bannerListeners) listener();
}

/** True when this device receives Web Push, so the page leaves system notifications to the server. */
let pushActive = false;
export function setPushActive(on: boolean) {
  pushActive = on;
}

async function systemNotification(title: string, body: string, to: string, tag: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const options = { body, icon: "/mascot/wave.png", badge: "/mascot/wave.png", tag, data: { url: to } };
    if (registration) await registration.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    /* some browsers refuse notifications outside a service worker */
  }
}

export type NotifyInput = {
  userId: string;
  prefs: Prefs;
  kind: string;
  title: string;
  body: string;
  to?: string;
  /** Same tag replaces an older notification instead of stacking. */
  tag?: string;
  /** Partner events and timers ignore quiet hours only when explicitly asked. */
  urgent?: boolean;
  /** Skip the in-app banner (e.g. when the toast is already shown elsewhere). */
  silentInApp?: boolean;
};

/** Records a notification in the centre, shows a banner in the app, or a system notification when Bloom is in the background. */
export function notify(input: NotifyInput): boolean {
  if (!kindOn(input.prefs, input.kind)) return false;
  load(input.userId);
  const kind = kindById.get(input.kind);
  const to = input.to ?? kind?.to ?? "/";
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  inbox = [{ id, kind: input.kind, title: input.title, body: input.body, to, at: new Date().toISOString(), read: false }, ...inbox].slice(0, 120);
  save();
  emit();
  if (inQuiet(input.prefs) && !input.urgent) return true;
  if (document.visibilityState === "visible") {
    if (!input.silentInApp) {
      banner = { id, kind, title: input.title, body: input.body, to };
      for (const listener of bannerListeners) listener();
    }
  } else if (!pushActive) void systemNotification(input.title, input.body, to, input.tag ?? input.kind);
  return true;
}

/* ------------------------------------------------------------------ once-per-period guards */

export function onceKey(userId: string, id: string, period: string) {
  return `bloom.sent.${userId}.${id}.${period}`;
}

export function alreadySent(userId: string, id: string, period: string): boolean {
  try {
    return localStorage.getItem(onceKey(userId, id, period)) != null;
  } catch {
    return false;
  }
}

export function markSent(userId: string, id: string, period: string) {
  try {
    localStorage.setItem(onceKey(userId, id, period), "1");
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ server copy */

/** What the push server needs to know to send the same reminders when Bloom is closed. */
export function pushSnapshot(prefs: Prefs, lang: string): PushSnapshot {
  const on: Record<string, boolean> = {};
  const times: Record<string, string> = {};
  for (const kind of notifyKinds) {
    on[kind.id] = kindOn(prefs, kind.id);
    if (kind.time) times[kind.id] = kindTime(prefs, kind.id);
  }
  return {
    lang,
    on,
    times,
    quiet: { on: prefs.quietOn, from: prefs.quietFrom, to: prefs.quietTo },
    waterEvery: prefs.waterEvery || 2,
    waterGoal: prefs.waterGoal,
    weekStart: prefs.weekStart,
  };
}
