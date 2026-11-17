# NOESIS desktop (Apollo on Windows)

Apollo in a small window that's always running, even with the browser closed.

- **Alt+P anywhere**: shows Apollo and starts listening; press again to send.
- **Alt+Shift+A**: show or hide the window.
- **Wake word**: turn it on once in the window (Apollo panel → Wake word on). The page stays loaded in the tray, so "Apollo, …" works with the site closed.
- **Tray icon**: show/hide, always on top, start with Windows (on by default), change the site address, quit.
- Speech-to-text: the desktop window has no Google speech service, so it records and your relay transcribes with Whisper (keep the relay running). The wake word uses a small offline model in the window.

## Install (once)

```
cd C:\noesis\desktop
npm install
npm run setup
npm start
```

`npm run setup` downloads Electron itself (newer npm versions block install scripts, so `npm install` alone doesn't).

On first start it asks for your NOESIS address (the one you use in the browser), then log in as usual.
It starts with Windows from then on (untick it in the tray menu to stop).
