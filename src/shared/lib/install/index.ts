import { useSyncExternalStore } from "react";

/** Chrome/Edge/Samsung/Yandex fire this when Bloom can be installed with one tap. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export type Platform = "ios" | "ios-other" | "android" | "desktop";

let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Call once at startup, before React renders, so the early event is not missed. */
export function listenForInstall() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export function isStandalone(): boolean {
  return (
    installed ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function platform(): Platform {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|YaBrowser|OPiOS/i.test(ua) ? "ios-other" : "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  emit();
  await event.prompt();
  const choice = await event.userChoice;
  if (choice.outcome === "accepted") installed = true;
  emit();
  return choice.outcome === "accepted";
}

type InstallState = { standalone: boolean; canPrompt: boolean; platform: Platform };
let snapshot: InstallState | null = null;

function read(): InstallState {
  const next = { standalone: isStandalone(), canPrompt: deferred !== null, platform: platform() };
  if (!snapshot || snapshot.standalone !== next.standalone || snapshot.canPrompt !== next.canPrompt || snapshot.platform !== next.platform) snapshot = next;
  return snapshot;
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    read,
  );
}

const DISMISS_KEY = "bloom.installDismissed";

export function installDismissed(): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return until > Date.now();
  } catch {
    return false;
  }
}

/** Hide the home banner for two weeks. */
export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 14 * 86_400_000));
  } catch {
    /* ignore */
  }
  emit();
}
