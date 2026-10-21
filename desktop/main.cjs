/**
 * Bloom for Windows: a small window around https://bloom-love.online that behaves like Telegram —
 * it lives in the tray when closed, starts with Windows, shows Windows notifications and can share
 * the screen with sound in the cinema. The page itself updates with every site deploy.
 */
const { app, BrowserWindow, Menu, Tray, desktopCapturer, ipcMain, nativeImage, powerSaveBlocker, screen, session, shell } = require("electron");
const path = require("node:path");

const SITE = process.env.BLOOM_URL || "https://bloom-love.online/";
const ORIGIN = new URL(SITE).origin;
const PROTOCOL = "bloom";
const ICON = path.join(__dirname, "build", "icon.png");
const BAR = 36;

app.setAppUserModelId("online.bloomlove.app");

// One Bloom at a time: a second launch (or a bloom:// link) goes to the running one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// A test run against another address (BLOOM_URL) leaves the bloom:// link to the installed app.
if (!process.env.BLOOM_URL) {
  if (process.defaultApp) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient(PROTOCOL);
}

/** @type {BrowserWindow | null} */
let win = null;
/** @type {Tray | null} */
let tray = null;
let quitting = false;
let pendingLink = linkFrom(process.argv);
const startHidden = process.argv.includes("--hidden");
const shown = new Set();

function linkFrom(argv) {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null;
}

function show() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function deliverLink(url) {
  if (win && !win.webContents.isLoading()) win.webContents.send("bloom:link", url);
  else pendingLink = url;
  show();
}

app.on("second-instance", (_event, argv) => {
  const url = linkFrom(argv);
  if (url) deliverLink(url);
  else show();
});

function icon(size) {
  return nativeImage.createFromPath(ICON).resize({ width: size, height: size, quality: "best" });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: "Bloom",
    icon: icon(256),
    backgroundColor: "#f3f1f8",
    // No browser bar: the page draws a slim "bloom" strip and Windows draws its own buttons on it.
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#f3f1f8", symbolColor: "#3a3550", height: BAR },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
      // Reminders and partner messages keep working while the window is hidden in the tray.
      backgroundThrottling: false,
    },
  });
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} BloomApp/desktop/${app.getVersion()}`);

  win.once("ready-to-show", () => {
    if (!startHidden) win.show();
  });

  // Closing the window hides it to the tray, like Telegram.
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
    if (!shown.has("tray-hint")) {
      shown.add("tray-hint");
      showNote({ key: "tray", title: "Bloom", body: "Bloom остаётся в трее и пришлёт уведомления · Bloom keeps running in the tray", to: "/", lang: "ru", silent: true });
    }
  });
  win.on("focus", () => win.flashFrame(false));
  // Hiding Bloom during a video call keeps the partner in a small floating picture.
  const keepPicture = () => {
    if (lastCall?.phase === "active") void win.webContents.executeJavaScript("window.__bloomCallPip && window.__bloomCallPip()", true).catch(() => undefined);
  };
  win.on("minimize", keepPicture);
  win.on("hide", keepPicture);

  // Links to other sites open in the normal browser; Bloom pages stay in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
      if (url.startsWith("http")) void shell.openExternal(url);
    }
  });

  // No internet: show a friendly page that retries by itself.
  win.webContents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) void win.loadFile(path.join(__dirname, "offline.html"), { query: { to: url || SITE } });
  });
  win.webContents.on("did-finish-load", () => {
    if (pendingLink) {
      win.webContents.send("bloom:link", pendingLink);
      pendingLink = null;
    }
  });

  void win.loadURL(SITE);
}

/* ------------------------------------------------------------------ notification cards (like Telegram) */

const NOTE_WIDTH = 376;
const NOTE_GAP = 2;
const MAX_NOTES = 4;
/** @type {Array<{ key: string; win: BrowserWindow; height: number; data: any; timer: NodeJS.Timeout | null; held: boolean }>} */
const notes = [];

function placeNotes() {
  const area = screen.getPrimaryDisplay().workArea;
  let bottom = area.y + area.height - 8;
  for (const note of [...notes].reverse()) {
    bottom -= note.height;
    note.win.setBounds({ x: area.x + area.width - NOTE_WIDTH - 8, y: Math.round(bottom), width: NOTE_WIDTH, height: note.height });
    bottom -= NOTE_GAP;
  }
}

function armNote(note) {
  if (note.timer) clearTimeout(note.timer);
  // A ringing call stays until it is answered, declined or given up.
  if (note.data.call) return;
  note.timer = note.held ? null : setTimeout(() => closeNote(note), note.data.chat ? 9000 : 6500);
}

function closeNote(note) {
  const index = notes.indexOf(note);
  if (index < 0) return;
  notes.splice(index, 1);
  if (note.timer) clearTimeout(note.timer);
  if (!note.win.isDestroyed()) {
    note.win.webContents.send("note:leave");
    setTimeout(() => !note.win.isDestroyed() && note.win.destroy(), 230);
  }
  placeNotes();
}

/** Shows a Bloom card in the corner; a card with the same key (one chat) is updated instead of stacked. */
function showNote(data) {
  const existing = notes.find((note) => note.key === data.key);
  if (existing) {
    existing.data = data;
    existing.win.webContents.send("note:data", data, true);
    // Bring the updated chat to the bottom like a new one.
    notes.splice(notes.indexOf(existing), 1);
    notes.push(existing);
    placeNotes();
    armNote(existing);
    return;
  }
  while (notes.length >= MAX_NOTES) closeNote(notes[0]);
  const noteWin = new BrowserWindow({
    width: NOTE_WIDTH,
    height: 120,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: { preload: path.join(__dirname, "note-preload.cjs"), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  noteWin.setAlwaysOnTop(true, "screen-saver");
  const note = { key: data.key, win: noteWin, height: 120, data, timer: null, held: false };
  notes.push(note);
  placeNotes();
  noteWin.webContents.once("did-finish-load", () => {
    noteWin.webContents.send("note:data", data, true);
    noteWin.showInactive();
    armNote(note);
  });
  void noteWin.loadFile(path.join(__dirname, data.call ? "call.html" : "note.html"));
}

function noteOf(event) {
  return notes.find((note) => !note.win.isDestroyed() && note.win.webContents === event.sender);
}

ipcMain.on("note:size", (event, height) => {
  const note = noteOf(event);
  if (!note || !height) return;
  note.height = Math.min(320, Math.max(70, height));
  placeNotes();
});
ipcMain.on("note:hold", (event, on) => {
  const note = noteOf(event);
  if (!note) return;
  note.held = on;
  armNote(note);
});
ipcMain.on("note:focus", (event) => noteOf(event)?.win.focus());
ipcMain.on("note:open", (event) => {
  const note = noteOf(event);
  if (!note) return;
  show();
  if (note.data.to) win?.webContents.send("bloom:link", `${PROTOCOL}://open?to=${encodeURIComponent(note.data.to)}`);
  closeNote(note);
});
ipcMain.on("note:close", (event) => {
  const note = noteOf(event);
  if (note) closeNote(note);
});
ipcMain.on("note:read", (event) => {
  const note = noteOf(event);
  if (!note) return;
  win?.webContents.send("bloom:action", "read", null);
  closeNote(note);
});
ipcMain.on("note:action", (event, action) => {
  const note = noteOf(event);
  if (!note) return;
  if (String(action).startsWith("call-accept")) show();
  win?.webContents.send("bloom:action", String(action), null);
  closeNote(note);
});
ipcMain.on("note:reply", (event, text) => {
  const note = noteOf(event);
  if (!note) return;
  win?.webContents.send("bloom:action", "reply", String(text).slice(0, 2000));
  note.held = false;
  setTimeout(() => closeNote(note), 1400);
});

function setUnread(count) {
  if (!win) return;
  tray?.setToolTip(count ? `Bloom · ${count}` : "Bloom");
  // A small coral dot on the taskbar icon while something is unread.
  win.setOverlayIcon(count ? nativeImage.createFromPath(path.join(__dirname, "build", "dot.png")) : null, count ? String(count) : "");
}

function createTray() {
  tray = new Tray(icon(32));
  tray.setToolTip("Bloom");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Открыть Bloom · Open", click: show },
      { type: "separator" },
      {
        label: "Запускать с Windows · Start with Windows",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => setAutostart(item.checked),
      },
      { type: "separator" },
      {
        label: "Выйти · Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", show);
}

function setAutostart(on) {
  app.setLoginItemSettings({ openAtLogin: on, args: ["--hidden"] });
  return app.getLoginItemSettings().openAtLogin;
}

/* ------------------------------------------------------------------ messages from the page */

const fromBloom = (event) => {
  try {
    return new URL(event.senderFrame?.url ?? "").origin === ORIGIN;
  } catch {
    return false;
  }
};

ipcMain.on("bloom:notify", (event, input) => {
  if (!fromBloom(event) || !input) return;
  const lines = Array.isArray(input.lines) ? input.lines.map(String).slice(-4) : [];
  showNote({
    key: input.chat ? "chat" : String(input.tag ?? Math.random()),
    title: String(input.title ?? "Bloom"),
    body: String(input.body ?? ""),
    lines,
    count: Number(input.count) || 0,
    chat: Boolean(input.chat),
    to: String(input.to ?? "/"),
    lang: String(input.lang ?? "ru"),
  });
  if (win && !win.isFocused()) win.flashFrame(true);
});
/* ------------------------------------------------------------------ calls */

let callBlocker = -1;
let lastCall = null;

function icon32(name) {
  return nativeImage.createFromPath(path.join(__dirname, "build", `${name}.png`));
}

/** Taskbar buttons under the Bloom thumbnail during a call: microphone, camera, hang up. */
function callButtons(call) {
  if (!win) return;
  if (!call || !["active", "connecting", "outgoing"].includes(call.phase)) return win.setThumbarButtons([]);
  const act = (name) => () => win?.webContents.send("bloom:action", name, null);
  win.setThumbarButtons([
    { tooltip: call.mic ? "Выключить микрофон · Mute" : "Включить микрофон · Unmute", icon: icon32(call.mic ? "call-mic" : "call-mic-off"), click: act("call-mic") },
    { tooltip: call.cam ? "Выключить камеру · Camera off" : "Включить камеру · Camera on", icon: icon32(call.cam ? "call-cam" : "call-cam-off"), click: act("call-cam") },
    { tooltip: "Завершить · End call", icon: icon32("call-end"), click: act("call-end") },
  ]);
}

ipcMain.on("bloom:call", (event, call) => {
  if (!fromBloom(event)) return;
  const was = lastCall;
  lastCall = call;
  // Ringing: a call card over everything unless Bloom is already in front.
  if (call?.phase === "incoming" && was?.phase !== "incoming") {
    if (!win?.isVisible() || !win.isFocused() || win.isMinimized()) showNote({ key: "incoming-call", call: true, title: String(call.name), video: Boolean(call.video), lang: app.getLocale().slice(0, 2) });
    win?.flashFrame(true);
  }
  if (call?.phase !== "incoming") for (const note of notes.filter((item) => item.key === "incoming-call")) closeNote(note);
  // No sleep and no screen-off while talking.
  const talking = Boolean(call) && ["outgoing", "connecting", "active"].includes(call.phase);
  if (talking && callBlocker < 0) callBlocker = powerSaveBlocker.start("prevent-display-sleep");
  if (!talking && callBlocker >= 0) {
    powerSaveBlocker.stop(callBlocker);
    callBlocker = -1;
  }
  callButtons(call);
  tray?.setToolTip(talking ? `Bloom · 📞 ${call.name}` : "Bloom");
});

/* ------------------------------------------------------------------ choosing a screen to share */

let pickerReady = false;
/** @type {((choice: { id: string; audio: boolean } | null) => void) | null} */
let pickerReply = null;
ipcMain.on("bloom:picker-ready", (event) => {
  if (fromBloom(event)) pickerReady = true;
});
ipcMain.on("bloom:screen-picked", (event, choice) => {
  if (!fromBloom(event) || !pickerReply) return;
  const reply = pickerReply;
  pickerReply = null;
  reply(choice && typeof choice.id === "string" ? { id: choice.id, audio: Boolean(choice.audio) } : null);
});

async function pickScreen(callback) {
  const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 400, height: 225 } });
  const own = new Set(BrowserWindow.getAllWindows().map((item) => item.getMediaSourceId()));
  const offered = sources.filter((source) => !own.has(source.id) && source.name);
  if (!pickerReady || !win) {
    const first = offered.find((source) => source.id.startsWith("screen"));
    return callback(first ? { video: first, audio: "loopback" } : {});
  }
  show();
  pickerReply?.(null);
  const choice = await new Promise((resolve) => {
    pickerReply = resolve;
    win.webContents.send(
      "bloom:pick-screen",
      offered.map((source) => ({ id: source.id, name: source.name, thumb: source.thumbnail.toDataURL(), screen: source.id.startsWith("screen") })),
    );
  });
  const source = choice && offered.find((item) => item.id === choice.id);
  callback(source ? { video: source, ...(choice.audio ? { audio: "loopback" } : {}) } : {});
}

ipcMain.on("bloom:dismiss", (event, key) => {
  if (!fromBloom(event)) return;
  for (const note of notes.filter((item) => item.key === String(key))) closeNote(note);
});
ipcMain.on("bloom:unread", (event, count) => fromBloom(event) && setUnread(Number(count) || 0));
ipcMain.on("bloom:open-external", (event, url) => {
  if (fromBloom(event) && /^https:\/\//.test(String(url))) void shell.openExternal(String(url));
});
ipcMain.on("bloom:title-bar", (event, colors) => {
  if (!fromBloom(event) || !win || !colors) return;
  try {
    win.setTitleBarOverlay({ color: String(colors.color), symbolColor: String(colors.symbol), height: BAR });
  } catch {
    /* older Windows */
  }
});
ipcMain.handle("bloom:autostart", (event, on) => {
  if (!fromBloom(event)) return false;
  return typeof on === "boolean" ? setAutostart(on) : app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle("bloom:take-link", (event) => {
  if (!fromBloom(event)) return null;
  const url = pendingLink;
  pendingLink = null;
  return url;
});

/* ------------------------------------------------------------------ start */

/** New versions of this app come from the project's GitHub releases and install on the next restart. */
function checkForUpdates() {
  if (process.defaultApp || process.env.BLOOM_URL) return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoInstallOnAppQuit = true;
    void autoUpdater.checkForUpdates().catch(() => undefined);
  } catch {
    /* updater unavailable */
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  checkForUpdates();
  setInterval(checkForUpdates, 6 * 3600_000);

  // Calls and the cinema: pick a screen or window (with the computer's sound if wanted), like Telegram.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => void pickScreen(callback).catch(() => callback({})), { useSystemPicker: false });
  // Camera, microphone and notifications for Bloom only.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    const ok = contents.getURL().startsWith(ORIGIN) && ["media", "notifications", "clipboard-read", "clipboard-sanitized-write", "display-capture", "fullscreen"].includes(permission);
    callback(ok);
  });

  // First run: start with Windows by default (can be switched off in the tray or settings).
  if (!app.getLoginItemSettings().openAtLogin && !process.defaultApp && !require("node:fs").existsSync(path.join(app.getPath("userData"), "autostart-set"))) {
    setAutostart(true);
    require("node:fs").writeFileSync(path.join(app.getPath("userData"), "autostart-set"), "1");
  }

  createTray();
  createWindow();
});

app.on("before-quit", () => {
  quitting = true;
});
app.on("window-all-closed", () => {
  // Stay in the tray.
});
