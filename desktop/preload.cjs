/** The few app abilities the Bloom page may use (see src/shared/lib/native on the site). */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bloomDesktop", {
  version: "3",
  openExternal: (url) => ipcRenderer.send("bloom:open-external", String(url)),
  notify: (input) => ipcRenderer.send("bloom:notify", input),
  dismiss: (key) => ipcRenderer.send("bloom:dismiss", String(key)),
  callState: (state) => ipcRenderer.send("bloom:call", state),
  onPickScreen: (listener) => {
    const handler = async (_event, sources) => {
      const choice = await listener(sources).catch(() => null);
      ipcRenderer.send("bloom:screen-picked", choice);
    };
    ipcRenderer.on("bloom:pick-screen", handler);
    ipcRenderer.send("bloom:picker-ready");
    return () => ipcRenderer.removeListener("bloom:pick-screen", handler);
  },
  onAction: (listener) => {
    const handler = (_event, action, payload) => listener(String(action), payload);
    ipcRenderer.on("bloom:action", handler);
    return () => ipcRenderer.removeListener("bloom:action", handler);
  },
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
