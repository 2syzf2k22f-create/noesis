"use client";
// Connect the school Microsoft account (Teams, Outlook, OneNote) and an Arbor calendar link.

import { useEffect, useState } from "react";
import type { BlockCtx } from "./Blocks";
import u from "./ui.module.css";

type St = { configured: boolean; connected: boolean; account: string | null; lastSync: string | null; lastResult: Record<string, unknown> | null; arbor: boolean };
const ago = (iso: string | null) => { if (!iso) return "never"; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const line = (k: string, v: unknown) => {
  const o = v as Record<string, unknown>;
  if (o?.error) return `${k}: ${o.error}`;
  if (k === "assignments") return `Teams: ${o.assignments} assignments (${o.added} new)`;
  if (k === "calendar" || k === "ics") return `${k === "ics" ? "Arbor" : "Calendar"}: ${o.events} events, ${o.lessons} lessons`;
  if (k === "mail") return `Mail: ${o.added} new emails`;
  if (k === "onenote") return `OneNote: ${o.pages} pages (${o.fetched} updated)`;
  return `${k}: ${String(v)}`;
};

export function MicrosoftBlock({ ctx }: { ctx: BlockCtx }) {
  const [st, setSt] = useState<St | null>(null);
  const [busy, setBusy] = useState(false);
  const [arbor, setArbor] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => fetch("/api/ms/status").then((r) => (r.ok ? r.json() : null)).then(setSt).catch(() => {});
  useEffect(() => {
    void load();
    const q = new URLSearchParams(location.search).get("ms");
    if (q) queueMicrotask(() => setMsg(q === "connected" ? "Connected. First sync done." : q));
  }, []);
  const sync = async (body: object = {}) => {
    setBusy(true);
    const r = await fetch("/api/ms/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r) { setSt(r); ctx.refresh?.(); }
  };
  // keep it fresh while the page is open: sync if the last one is over 5 minutes old
  useEffect(() => {
    if (!st?.connected) return;
    const due = !st.lastSync || Date.now() - Date.parse(st.lastSync) > 5 * 60e3;
    if (due && !busy) queueMicrotask(() => { void sync(); });
  }, [st?.connected]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return <div className="label">Loading…</div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {!st.configured ? (
        <p className="label">Waiting for the Microsoft app ID (MS_CLIENT_ID) to be set in Netlify.</p>
      ) : st.connected ? (
        <div className={u.row}>
          <b>✓ {st.account}</b>
          <span className="label">synced {ago(st.lastSync)} · auto every 15 min</span>
          <button className="pill" data-active="true" disabled={busy} onClick={() => sync()}>{busy ? "Syncing…" : "Sync now"}</button>
          <button className="pill" onClick={() => sync({ disconnect: true })}>Disconnect</button>
        </div>
      ) : (
        <div className={u.row}>
          <a className="pill" data-active="true" href="/api/ms/login">Connect school Microsoft account</a>
          <span className="label">Read-only: Teams assignments, Outlook calendar &amp; mail, OneNote.</span>
        </div>
      )}
      {msg && <div className="label">{msg}</div>}
      {st.lastResult && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{Object.entries(st.lastResult).map(([k, v]) => <li key={k}>{line(k, v)}</li>)}</ul>}
      <div className={u.row}>
        <input style={{ flex: 1, minWidth: 220, height: 34, padding: "0 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
          placeholder={st.arbor ? "Arbor calendar linked (paste a new link to replace)" : "Arbor calendar link (webcal:// or https://…ics), if lessons aren't in Outlook"}
          value={arbor} onChange={(e) => setArbor(e.target.value)} />
        <button className="pill" disabled={!arbor.trim() || busy} onClick={() => { void sync({ arbor }); setArbor(""); }}>Save &amp; sync</button>
      </div>
    </div>
  );
}
