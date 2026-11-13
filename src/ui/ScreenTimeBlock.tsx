"use client";
// Screen time from a screenshot (iPhone Screen Time or Android Digital Wellbeing).
// The text is read in your browser (Tesseract OCR); you check the numbers, then save.
// Saves the day's total to screentime_days and each app to screentime_apps.

import { useState } from "react";
import type { BlockCtx } from "./Blocks";
import u from "./ui.module.css";
import { parseScreenTime, type App } from "./screenParse";

const OCR_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tesseract(): Promise<any> {
  const w = window as unknown as { Tesseract?: unknown };
  if (w.Tesseract) return w.Tesseract;
  await new Promise<void>((ok, bad) => { const s = document.createElement("script"); s.src = OCR_URL; s.onload = () => ok(); s.onerror = () => bad(new Error("couldn't load the text reader")); document.head.appendChild(s); });
  return w.Tesseract;
}

const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export function ScreenTimeBlock({ ctx }: { ctx: BlockCtx }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<{ total: number | null; average: boolean; apps: App[]; img: string } | null>(null);
  const [day, setDay] = useState(() => ymd(new Date(Date.now() - 864e5)));
  const [source, setSource] = useState("iPhone");
  const [msg, setMsg] = useState<string | null>(null);

  const read = async (file: File) => {
    setMsg(null); setRes(null);
    const img = URL.createObjectURL(file);
    try {
      setBusy("Loading the text reader…");
      const T = await tesseract();
      setBusy("Reading the screenshot…");
      const r = await T.recognize(file, "eng");
      const p = parseScreenTime(r.data.text as string);
      setRes({ ...p, img });
      if (p.total == null) setMsg("Couldn't find a total; type it in below.");
    } catch (e) { setMsg((e as Error).message); }
    setBusy(null);
  };
  const save = async () => {
    if (!res || res.total == null) return;
    setBusy("Saving…");
    await ctx.write("create", "screentime_days", { day, minutes: Math.round(res.total), source: `${source}${res.average ? " (weekly average)" : ""}` });
    for (const a of res.apps) await ctx.write("create", "screentime_apps", { day, app: a.app, minutes: a.minutes, source });
    setBusy(null); setRes(null);
    setMsg(`Saved ${Math.floor(res.total / 60)}h ${res.total % 60}m for ${day}${res.apps.length ? ` and ${res.apps.length} apps` : ""}.`);
    ctx.refresh?.();
  };
  const fmt = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p className="label" style={{ margin: 0 }}>iPhone: Settings → Screen Time → See All App &amp; Website Activity → Day, then screenshot. Android: Digital Wellbeing. Read on your device; nothing is uploaded.</p>
      <div className={u.row}>
        <label className="pill" data-active="true" style={{ cursor: "pointer" }}>
          Choose screenshot
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} />
        </label>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ height: 34, padding: "0 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} />
        <select value={source} onChange={(e) => setSource(e.target.value)} style={{ height: 34, padding: "0 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}>
          {["iPhone", "Android", "iPad", "Laptop"].map((x) => <option key={x}>{x}</option>)}
        </select>
        {busy && <span className="label">{busy}</span>}
      </div>
      {msg && <div className="label">{msg}</div>}
      {res && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 160px) 1fr", gap: 12, alignItems: "start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={res.img} alt="Your screenshot" style={{ width: "100%", borderRadius: 8 }} />
          <div style={{ display: "grid", gap: 6 }}>
            <label className={u.row}>
              <b>Total</b>
              <input type="number" value={res.total ?? ""} onChange={(e) => setRes({ ...res, total: e.target.value ? Number(e.target.value) : null })} style={{ width: 90, height: 30, padding: "0 6px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }} />
              <span className="label">minutes{res.total != null ? ` (${fmt(res.total)})` : ""}{res.average ? " · this screenshot shows a daily average" : ""}</span>
            </label>
            {res.apps.map((a, i) => (
              <div key={i} className={u.row}>
                <input value={a.app} onChange={(e) => setRes({ ...res, apps: res.apps.map((x, j) => (j === i ? { ...x, app: e.target.value } : x)) })} style={{ flex: 1, height: 28, padding: "0 6px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }} />
                <input type="number" value={a.minutes} onChange={(e) => setRes({ ...res, apps: res.apps.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)) })} style={{ width: 70, height: 28, padding: "0 6px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }} />
                <button className="pill" onClick={() => setRes({ ...res, apps: res.apps.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <div className={u.row}>
              <button className="pill" data-active="true" disabled={res.total == null || !!busy} onClick={save}>Save</button>
              <button className="pill" onClick={() => setRes(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
