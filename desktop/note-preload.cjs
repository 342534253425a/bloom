/** What a Bloom notification card (note.html) may ask the app to do. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bloomNote", {
  size: (height) => ipcRenderer.send("note:size", Number(height) || 0),
  hold: (on) => ipcRenderer.send("note:hold", Boolean(on)),
  focus: () => ipcRenderer.send("note:focus"),
  open: () => ipcRenderer.send("note:open"),
  close: () => ipcRenderer.send("note:close"),
  read: () => ipcRenderer.send("note:read"),
  reply: (text) => ipcRenderer.send("note:reply", String(text)),
  action: (name) => ipcRenderer.send("note:action", String(name)),
  onData: (listener) => ipcRenderer.on("note:data", (_event, data, fresh) => listener(data, fresh)),
  onLeave: (listener) => ipcRenderer.on("note:leave", () => listener()),
});
