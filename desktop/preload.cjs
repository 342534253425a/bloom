/** The few app abilities the Bloom page may use (see src/shared/lib/native on the site). */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bloomDesktop", {
  version: "1",
  openExternal: (url) => ipcRenderer.send("bloom:open-external", String(url)),
  notify: (input) => ipcRenderer.send("bloom:notify", input),
  setUnread: (count) => ipcRenderer.send("bloom:unread", Number(count) || 0),
  setTitleBar: (colors) => ipcRenderer.send("bloom:title-bar", colors),
  getAutostart: () => ipcRenderer.invoke("bloom:autostart"),
  setAutostart: (on) => ipcRenderer.invoke("bloom:autostart", Boolean(on)),
  takeLink: () => ipcRenderer.invoke("bloom:take-link"),
  onLink: (listener) => {
    const handler = (_event, url) => listener(String(url));
    ipcRenderer.on("bloom:link", handler);
    return () => ipcRenderer.removeListener("bloom:link", handler);
  },
});
