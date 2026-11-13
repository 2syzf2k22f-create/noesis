"use client";
// Build mode: ask for a change to the site's own code. The relay on your PC makes it on a
// branch, checks it builds, deploys a preview; you Ship it or Roll back.

import { useEffect, useState } from "react";
import u from "./ui.module.css";

type B = { id: string; status: string; request: string; title?: string | null; proposed?: boolean; at: string; step?: string; branch?: string; summary?: string; diffstat?: string; preview?: string | null; note?: string | null; shipped?: boolean; rolled_back?: boolean; error?: string | null; prod?: string | null };

export function BuildBlock() {
  const [d, setD] = useState<{ autoShip: boolean; relayOnline: boolean; builds: B[] } | null>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = () => fetch("/api/build").then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  useEffect(() => { void load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const act = async (id: string, action: string) => { await fetch(`/api/build/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }); void load(); };
  if (!d) return <div className="label">Loading…</div>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="label" style={{ margin: 0 }}>Describe a change to NOESIS itself. Claude Code on your PC makes it on a separate branch, runs the typecheck, lint and build, and deploys a preview. Nothing reaches the live site until you press Ship it. Only requests typed here (or chat messages starting “build:”) can start a build.</p>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Add a 'protein per meal' bar chart to the Nutrition overview"
        style={{ width: "100%", padding: 10, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", font: "14px var(--font-body)" }} />
      <div className={u.row}>
        <button className="pill" data-active="true" disabled={text.trim().length < 5} onClick={async () => { await fetch("/api/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: text }) }); setText(""); void load(); }}>Build it</button>
        <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={d.autoShip} onChange={async (e) => { await fetch("/api/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ autoShip: e.target.checked }) }); void load(); }} />
          Auto-ship small changes (≤ 40 lines)
        </label>
        <span className="label">Relay {d.relayOnline ? "online" : "offline: builds wait in the queue"}</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {d.builds.map((b) => {
          const state = b.rolled_back ? "rolled back" : b.shipped ? "shipped" : b.status === "error" ? "failed" : b.status === "done" ? "ready" : b.status === "proposed" ? "Apollo's proposal" : b.status === "cancelled" ? "declined" : b.status;
          return (
            <li key={b.id} style={{ padding: 12, borderRadius: 10, background: "var(--surface)", display: "grid", gap: 6 }}>
              <div className={u.row}>
                <b style={{ flex: 1 }}>{b.request}</b>
                <span className="pill" data-active={state === "ready" || state === "shipped"}>{state}</span>
              </div>
              <small className="label">{new Date(b.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{b.branch ? ` · ${b.branch}` : ""}{b.diffstat ? ` · ${b.diffstat}` : ""}{b.status !== "done" && b.status !== "error" && b.step ? ` · ${b.step}` : ""}</small>
              {b.error && <small style={{ color: "var(--danger)", whiteSpace: "pre-wrap" }}>{b.error.slice(0, 600)}</small>}
              {b.note && <small className="label">{b.note}</small>}
              <div className={u.row}>
                {b.status === "proposed" && <button className="pill" data-active="true" onClick={() => act(b.id, "approve")}>Build it</button>}
                {b.status === "proposed" && <button className="pill" onClick={() => act(b.id, "decline")}>No thanks</button>}
                {b.preview && <a className="pill" href={b.preview} target="_blank" rel="noreferrer">Open preview ↗</a>}
                {b.status === "done" && !b.shipped && !b.rolled_back && <button className="pill" data-active="true" onClick={() => act(b.id, "ship")}>Ship it</button>}
                {b.status === "done" && !b.rolled_back && <button className="pill" onClick={() => act(b.id, "rollback")}>{b.shipped ? "Roll back (revert)" : "Discard"}</button>}
                {b.summary && <button className="pill" onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? "Hide" : "What changed"}</button>}
              </div>
              {open === b.id && <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12.5 }}>{b.summary}</pre>}
            </li>
          );
        })}
        {!d.builds.length && <li className="label">No builds yet.</li>}
      </ul>
    </div>
  );
}
