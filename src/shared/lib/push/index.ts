import { supabase } from "@/shared/api/supabase";

/** Web Push: lets the server reach this device when Bloom is closed (supabase/functions/push). */

export const pushSupported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** iPhone only allows notifications from the installed home-screen app. */
export function needsInstallForPush() {
  return isIos() && !isStandalone();
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration() {
  if (!pushSupported) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function vapidKey(): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("push", { body: { type: "vapid" } });
    if (error) return null;
    return typeof data?.publicKey === "string" ? data.publicKey : null;
  } catch {
    return null;
  }
}

export type PushSnapshot = {
  lang: string;
  on: Record<string, boolean>;
  times: Record<string, string>;
  quiet: { on: boolean; from: string; to: string };
  waterEvery: number;
  waterGoal: number;
  weekStart: "monday" | "sunday";
};

async function save(sub: PushSubscription, snapshot: PushSnapshot) {
  // The server moves this device to the signed-in account even if another account used it before.
  const { error } = await supabase.rpc("claim_push_subscription", {
    p_endpoint: sub.endpoint,
    p_sub: sub.toJSON(),
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    p_lang: snapshot.lang,
    p_prefs: snapshot,
  });
  if (error) throw error;
}

export type EnableResult = "ok" | "denied" | "unsupported" | "install" | "server";

/** Why the last attempt to subscribe failed, shown in settings so it can be reported. */
export let lastPushError = "";

/** Asks for permission (must run from a tap), subscribes this device and stores it on the server. */
export async function enablePush(snapshot: PushSnapshot): Promise<EnableResult> {
  if (needsInstallForPush()) return "install";
  if (!pushSupported) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = (await registration()) ?? (await navigator.serviceWorker.ready);
  const key = await vapidKey();
  if (!key) {
    lastPushError = "no server key (push function unreachable)";
    return "server";
  }
  try {
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with another server key can't receive our pushes.
    if (sub && sub.options.applicationServerKey) {
      const current = new Uint8Array(sub.options.applicationServerKey);
      const wanted = base64ToBytes(key);
      if (current.length !== wanted.length || current.some((byte, i) => byte !== wanted[i])) {
        await sub.unsubscribe();
        sub = null;
      }
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(key) });
    await save(sub, snapshot);
    lastPushError = "";
    return "ok";
  } catch (error) {
    console.warn("Bloom push", error);
    lastPushError = error instanceof Error ? `${error.name}: ${error.message}` : String((error as { message?: string })?.message ?? error);
    return "server";
  }
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

/** Keeps the server's copy of the notification settings current. */
export async function syncPushPrefs(snapshot: PushSnapshot) {
  const sub = await currentSubscription();
  if (!sub) return false;
  try {
    await save(sub, snapshot);
    return true;
  } catch {
    return false;
  }
}

/** Tells the server a reminder was already shown in the app, so it won't push the same one. */
export async function markServerSent(key: string) {
  try {
    await supabase.from("push_sent").upsert({ key }, { onConflict: "user_id,key", ignoreDuplicates: true });
  } catch {
    /* best effort */
  }
}

/** Asks the server to push a test notification to all of this person's devices. */
export async function sendTestPush(): Promise<number | null> {
  try {
    const { data, error } = await supabase.functions.invoke("push", { body: { type: "test" } });
    if (error) return null;
    return typeof data?.sent === "number" ? data.sent : null;
  } catch {
    return null;
  }
}

/** Subscribes quietly when notifications are already allowed (no prompt is shown). */
export async function ensurePush(snapshot: PushSnapshot): Promise<boolean> {
  if (!pushSupported || needsInstallForPush() || Notification.permission !== "granted") return false;
  return (await enablePush(snapshot)) === "ok";
}
