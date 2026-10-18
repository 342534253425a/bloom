/* Bloom push handlers, imported into the generated service worker (vite.config.ts → workbox.importScripts). */

const ua = (self.navigator && self.navigator.userAgent) || "";
// Safari (iPhone, Mac) may cancel the subscription if a push doesn't show a notification, so it always shows one.
const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|YaBrowser|OPR/.test(ua);

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Bloom", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = windows.some((client) => client.visibilityState === "visible");
      windows.forEach((client) => client.postMessage({ type: "bloom-push", data }));
      if (visible && !isSafari) return;
      await self.registration.showNotification(data.title || "Bloom", {
        body: data.body || "",
        icon: "/mascot/wave.png",
        badge: "/mascot/wave.png",
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        data: { url: data.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "bloom-open", url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
