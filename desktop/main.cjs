/* eslint-disable @typescript-eslint/no-require-imports */
// NOESIS desktop: Apollo in a small always-available window.
//  - Alt+P anywhere in Windows: shows Apollo and starts/stops listening (the site's own push-to-talk).
//  - Tray icon: show / hide / always on top / start with Windows / quit. Closing the window only hides it.
//  - The page stays loaded in the background, so the wake word ("Apollo, ...") keeps working with the browser closed.
//  - The microphone is allowed for your NOESIS site only.
const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, nativeImage, screen, session } = require("electron");
const fs = require("fs");
const path = require("path");

if (!app.requestSingleInstanceLock()) app.quit();
const cfgFile = path.join(app.getPath("userData"), "config.json");
const cfg = (() => { try { return JSON.parse(fs.readFileSync(cfgFile, "utf8")); } catch { return {}; } })();
const saveCfg = () => fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
let win = null, tray = null, quitting = false;

function place() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = 460, h = Math.min(760, wa.height - 40);
  win.setBounds({ x: wa.x + wa.width - w - 16, y: wa.y + wa.height - h - 16, width: w, height: h });
}
function show() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function create() {
  win = new BrowserWindow({
    width: 460, height: 760, show: false, title: "Apollo", backgroundColor: "#0b1020", autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "public", "icons", "icon-192.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), backgroundThrottling: false, partition: "persist:noesis" },
  });
  place();
  win.setAlwaysOnTop(!!cfg.onTop);
  win.on("close", (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  const ses = session.fromPartition("persist:noesis");
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(["media", "notifications", "clipboard-read", "clipboard-sanitized-write"].includes(perm) && cfg.url && wc.getURL().startsWith(cfg.url)));
  ses.setPermissionCheckHandler((wc, perm, origin) => ["media", "notifications"].includes(perm) && !!cfg.url && String(origin).startsWith(new URL(cfg.url).origin));
  if (cfg.url) win.loadURL(cfg.url + "/?desktop=1"); else { win.loadFile(path.join(__dirname, "setup.html")); win.show(); }
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("noesis-setup://")) {
      e.preventDefault();
      let u = decodeURIComponent(url.slice("noesis-setup://".length)).replace(/\/+$/, "");
      if (!/^https?:\/\//.test(u)) u = "https://" + u;
      cfg.url = u; saveCfg(); win.loadURL(u + "/?desktop=1");
    }
  });
  // links to other sites open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { require("electron").shell.openExternal(url); return { action: "deny" }; });
}
function pushToTalk() {
  show();
  // the site toggles listening on Alt+P; send it to the page
  setTimeout(() => {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "P", modifiers: ["alt"] });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "P", modifiers: ["alt"] });
  }, 120);
}
function menu() {
  return Menu.buildFromTemplate([
    { label: "Show Apollo", click: show },
    { label: "Talk (Alt+P)", click: pushToTalk },
    { type: "separator" },
    { label: "Always on top", type: "checkbox", checked: !!cfg.onTop, click: (m) => { cfg.onTop = m.checked; saveCfg(); win.setAlwaysOnTop(m.checked); } },
    { label: "Start with Windows", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin, click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked, args: ["--hidden"] }) },
    { label: "Change site address…", click: () => { delete cfg.url; saveCfg(); win.loadFile(path.join(__dirname, "setup.html")); show(); } },
    { type: "separator" },
    { label: "Quit", click: () => { quitting = true; app.quit(); } },
  ]);
}
app.on("second-instance", show);
app.whenReady().then(() => {
  if (cfg.firstRun !== false) { app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] }); cfg.firstRun = false; saveCfg(); }
  create();
  if (cfg.url && !process.argv.includes("--hidden")) win.once("ready-to-show", show);
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "..", "public", "icons", "icon-192.png")).resize({ width: 16, height: 16 }));
  tray.setToolTip("Apollo (Alt+P to talk)");
  tray.on("click", () => (win.isVisible() ? win.hide() : show()));
  tray.setContextMenu(menu());
  if (!globalShortcut.register("Alt+P", pushToTalk)) console.log("Alt+P is taken by another app");
  globalShortcut.register("Alt+Shift+A", () => (win.isVisible() && win.isFocused() ? win.hide() : show()));
  ipcMain.on("show", show);
  ipcMain.on("hide", () => win.hide());
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", (e) => e.preventDefault());
