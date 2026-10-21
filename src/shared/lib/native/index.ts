/**
 * Bloom runs in three shells: a browser tab or PWA, the Windows app (Electron, see /desktop)
 * and the Android app (Capacitor, see /android). Both apps load the same site and add
 * "BloomApp/<platform>" to the user agent, so the page knows where it runs before anything loads.
 */

export type Shell = "web" | "android" | "desktop";

const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
export const shell: Shell = /BloomApp\/desktop/.test(ua) ? "desktop" : /BloomApp\/android/.test(ua) ? "android" : "web";
export const isApp = shell !== "web";

/** Where Google sends people back to inside the apps (registered by both apps as their own link). */
export const AUTH_CALLBACK = "bloom://auth-callback";

/** Public download links for the apps (GitHub releases of this project). */
export const DOWNLOADS = {
  windows: "https://github.com/342534253425a/bloom/releases/latest/download/Bloom-Setup.exe",
  android: "https://github.com/342534253425a/bloom/releases/latest/download/Bloom.apk",
};

/** A notification as the apps show it; chats carry the latest unread lines and their count. */
export type AppNote = { title: string; body: string; to: string; tag: string; urgent?: boolean; chat?: boolean; lines?: string[]; count?: number; lang?: string };

/** What the Windows app's preload script (desktop/preload.cjs) exposes. */
type DesktopBridge = {
  version: string;
  openExternal: (url: string) => void;
  notify: (input: AppNote) => void;
  /** Older installs (version "1") don't have these. */
  dismiss?: (key: string) => void;
  onAction?: (listener: (action: string, payload: unknown) => void) => () => void;
  setUnread: (count: number) => void;
  setTitleBar: (colors: { color: string; symbol: string }) => void;
  getAutostart: () => Promise<boolean>;
  setAutostart: (on: boolean) => Promise<boolean>;
  takeLink: () => Promise<string | null>;
  onLink: (listener: (url: string) => void) => () => void;
};

export const desktop: DesktopBridge | undefined = shell === "desktop" ? (window as unknown as { bloomDesktop?: DesktopBridge }).bloomDesktop : undefined;

/* ------------------------------------------------------------------ "open this screen" from outside */

const openListeners = new Set<(to: string) => void>();
let pendingOpen: string | null = null;

/** A tapped notification asks the app to show a screen; NotifyHost listens and navigates. */
export function onOpenRequest(listener: (to: string) => void): () => void {
  openListeners.add(listener);
  if (pendingOpen) {
    const to = pendingOpen;
    pendingOpen = null;
    listener(to);
  }
  return () => openListeners.delete(listener);
}

export function requestOpen(to: string) {
  if (!to.startsWith("/")) return;
  if (!openListeners.size) pendingOpen = to;
  for (const listener of openListeners) listener(to);
}

/* ------------------------------------------------------------------ links back into the app */

type LinkHandler = (url: URL) => void | Promise<void>;
let authHandler: LinkHandler | null = null;

/** Set by the sign-in code: receives bloom://auth-callback?code=… after Google. */
export function onAuthCallback(handler: LinkHandler) {
  authHandler = handler;
}

async function handleLink(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }
  if (url.protocol !== "bloom:") return;
  // bloom://auth-callback?code=…  ·  bloom://open?to=/habits
  const target = url.host || url.pathname.replace(/^\/+/, "");
  if (target === "auth-callback") {
    if (shell === "android") {
      const { Browser } = await import("@capacitor/browser");
      await Browser.close().catch(() => undefined);
    }
    await authHandler?.(url);
  } else if (target === "open") requestOpen(url.searchParams.get("to") ?? "/");
}

/** Opens a web page outside the app: the system browser on Windows, an in-app browser tab on Android. */
export async function openOutside(url: string) {
  if (desktop) desktop.openExternal(url);
  else if (shell === "android") {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "popover" });
  } else window.open(url, "_blank", "noopener");
}

/* ------------------------------------------------------------------ notifications */

/** A stable small number for a notification tag (Android needs integer ids). */
export function numericId(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (Math.imul(31, hash) + tag.charCodeAt(i)) | 0;
  return Math.abs(hash) % 2_000_000_000;
}

/** Shows a system notification from the app shell. Returns false on the web (the page handles it). */
export function appNotification(input: AppNote): boolean {
  if (desktop) {
    desktop.notify(input);
    return true;
  }
  if (shell === "android") {
    const lines = input.lines ?? [];
    void import("@capacitor/local-notifications").then(({ LocalNotifications }) =>
      LocalNotifications.schedule({
        notifications: [
          {
            // One card per chat that grows, like messengers do.
            id: numericId(input.chat ? "now:chat" : `now:${input.tag}`),
            title: input.title,
            body: lines.at(-1) ?? input.body,
            largeBody: lines.length > 1 ? lines.join("\n") : undefined,
            inboxList: lines.length > 1 ? lines.slice(-5) : undefined,
            summaryText: input.chat && (input.count ?? 0) > 1 ? String(input.count) : undefined,
            group: input.chat ? "bloom-chat" : undefined,
            extra: { to: input.to },
            smallIcon: "ic_stat_bloom",
            channelId: "bloom",
          },
        ],
      }),
    );
    return true;
  }
  return false;
}

/** Closes a shown notification, e.g. the chat card once the messages are read. */
export function dismissAppNotification(key: "chat") {
  desktop?.dismiss?.(key);
  if (shell === "android")
    void import("@capacitor/local-notifications").then(({ LocalNotifications }) => LocalNotifications.cancel({ notifications: [{ id: numericId(`now:${key}`) }] }).catch(() => undefined));
}

/** Reply and "mark as read" from a notification card on Windows. */
export function onNoteAction(listener: (action: string, payload: unknown) => void): () => void {
  return desktop?.onAction?.(listener) ?? (() => {});
}

/** True when the person is looking at Bloom right now (on Windows a window behind others doesn't count). */
export function inFront(): boolean {
  if (document.visibilityState !== "visible") return false;
  return shell === "desktop" ? document.hasFocus() : true;
}

/** Unread count on the taskbar icon (Windows). */
export function setUnread(count: number) {
  desktop?.setUnread(count);
}

/** Asks Android for permission to show notifications (Android 13+). */
export async function askAndroidNotifications(): Promise<boolean> {
  if (shell !== "android") return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const next = await LocalNotifications.requestPermissions();
  return next.display === "granted";
}

export async function androidNotificationsAllowed(): Promise<boolean> {
  if (shell !== "android") return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return (await LocalNotifications.checkPermissions()).display === "granted";
}

/* ------------------------------------------------------------------ startup */

/** Wires the app shell up once, before React renders. Does nothing in a browser. */
export async function startShell() {
  if (!isApp) return;
  document.documentElement.classList.add(`is-app`, `is-${shell}`);

  if (desktop) {
    desktop.onLink((url) => void handleLink(url));
    const first = await desktop.takeLink();
    if (first) void handleLink(first);
    // The window buttons sit on the page's own background.
    desktop.setTitleBar({ color: "#f3f1f8", symbol: "#3a3550" });
    return;
  }

  // Android
  const [{ App }, { LocalNotifications }] = await Promise.all([import("@capacitor/app"), import("@capacitor/local-notifications")]);
  void App.addListener("appUrlOpen", ({ url }) => void handleLink(url));
  const launch = await App.getLaunchUrl().catch(() => undefined);
  if (launch?.url) void handleLink(launch.url);
  void App.addListener("backButton", ({ canGoBack }) => {
    // Close an open sheet first, then go back, and only then leave the app (like other apps do).
    if (document.querySelector(".sheet-root.is-open")) document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    else if (canGoBack && window.location.pathname !== "/") window.history.back();
    else void App.minimizeApp();
  });
  void LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
    const to = (notification.extra as { to?: string } | undefined)?.to;
    if (to) requestOpen(to);
  });
  await LocalNotifications.createChannel({ id: "bloom", name: "Bloom", importance: 4, visibility: 1, vibration: true, lights: true, lightColor: "#5ccfa0" }).catch(() => undefined);
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  void StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
  void offerAndroidUpdate(App);
}

/** The page updates by itself; the app shell only when a newer APK is published. Asks at most once a day. */
async function offerAndroidUpdate(App: typeof import("@capacitor/app").App) {
  try {
    const key = "bloom.updateAsked";
    if (Number(localStorage.getItem(key) ?? 0) > Date.now() - 86_400_000) return;
    const [{ build }, release] = await Promise.all([
      App.getInfo(),
      fetch("https://api.github.com/repos/342534253425a/bloom/releases/latest").then((res) => res.json() as Promise<{ tag_name?: string }>),
    ]);
    const latest = Number(release.tag_name?.replace("apps-", "") ?? 0);
    if (!latest || latest <= Number(build)) return;
    localStorage.setItem(key, String(Date.now()));
    const ru = /^ru/.test(navigator.language);
    if (window.confirm(ru ? "Есть новая версия приложения Bloom. Скачать?" : "A new version of the Bloom app is available. Download it?")) await openOutside(DOWNLOADS.android);
  } catch {
    /* offline or GitHub unreachable */
  }
}
