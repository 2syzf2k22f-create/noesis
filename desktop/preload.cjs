/* eslint-disable @typescript-eslint/no-require-imports */
// The site can ask the desktop app to show itself (wake word heard, Apollo replying).
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("noesisDesktop", { show: () => ipcRenderer.send("show"), hide: () => ipcRenderer.send("hide"), isDesktop: true });
