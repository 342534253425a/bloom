import type { Prefs } from "@/entities/prefs";
import { kindById, notifyKinds } from "@/shared/config/notifications";
import { appNotification, inFront, isApp, shell } from "@/shared/lib/native";
import type { PushSnapshot } from "@/shared/lib/push";
import { currentLang } from "@/shared/i18n";

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

/* ------------------------------------------------------------------ delivery */

// Older versions kept a notification inbox on the device; it is gone, so its leftovers are cleared once.
try {
  for (const name of Object.keys(localStorage)) if (name.startsWith("bloom.inbox.")) localStorage.removeItem(name);
} catch {
  /* storage may be unavailable */
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
  /** Chat messages: the latest unread lines and how many there are, shown together like messengers do. */
  chat?: { lines: string[]; count: number };
};

/**
 * Shows a system notification (or a Bloom card in the Windows app) when Bloom is in the background.
 * While Bloom is open in front nothing pops up: the chat badge and the screens themselves show what's new.
 */
export function notify(input: NotifyInput): boolean {
  if (!kindOn(input.prefs, input.kind)) return false;
  if (inQuiet(input.prefs) && !input.urgent) return true;
  if (isApp ? inFront() : document.visibilityState === "visible") return true;
  const kind = kindById.get(input.kind);
  const to = input.to ?? kind?.to ?? "/";
  if (isApp) {
    // On Android with Firebase the server already pushed partner events to this phone.
    if (!(shell === "android" && pushActive && kind?.group === "partner"))
      appNotification({ title: input.title, body: input.body, to, tag: input.tag ?? input.kind, urgent: input.urgent, chat: Boolean(input.chat), lines: input.chat?.lines, count: input.chat?.count, lang: currentLang() });
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
