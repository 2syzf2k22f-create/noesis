"use client";
// Settings: connect Spotify, and manage PC "always allow" rules.

import { useEffect, useState } from "react";
import u from "./ui.module.css";

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");
const post = (url: string, body: object) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);

export function SpotifyBlock() {
  const [st, setSt] = useState<{ configured: boolean; connected: boolean; user: string | null; product: string | null; premium: boolean; service: "apple_music" | "spotify" } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const load = () => fetch("/api/spotify/status").then((r) => (r.ok ? r.json() : null)).then(setSt).catch(() => {});
  useEffect(() => {
    void load();
    const q = new URLSearchParams(location.search).get("spotify");
    if (q) queueMicrotask(() => setFlash(q === "connected" ? "Spotify connected." : q === "denied" ? "You cancelled the Spotify sign-in." : "Spotify sign-in failed. Try again."));
  }, []);
  if (!st) return <div className="label">Loading…</div>;
  const pick = (service: string) => <button className="pill" data-active={st.service === service} onClick={async () => { await post("/api/spotify/status", { action: "service", service }); void load(); }}>{service === "apple_music" ? "Apple Music" : "Spotify"}</button>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {flash && <div className="label">{flash}</div>}
      <div className={u.row}><span className="label">Apollo plays music with</span>{pick("apple_music")}{pick("spotify")}</div>
      {st.service === "apple_music" ? (
        <small className="label">Apple Music: Apollo opens the Apple Music app on your PC, searches and presses play on the best match (Apple has no free playback API, so it drives the app). Needs the Apple Music app from the Microsoft Store. Pause, skip and volume use the media keys. Nothing to sign in to.</small>
      ) : <>
      <div className={u.row}>
        <span style={{ color: st.connected ? "var(--good)" : "var(--text-dim)" }}>● {st.connected ? `Connected${st.user ? ` as ${st.user}` : ""}` : "Not connected"}</span>
        {st.connected && <span className="pill" data-active={st.premium}>{st.premium ? "Premium: Apollo can play exact songs" : `${st.product ?? "Free"}: Apollo can only open searches`}</span>}
      </div>
      <div className={u.row}>
        {!st.configured ? <span className="label">Waiting for SPOTIFY_CLIENT_ID to be set in Vercel.</span>
          : st.connected ? <button className="pill" onClick={async () => { await post("/api/spotify/status", { action: "disconnect" }); void load(); }}>Disconnect</button>
          : <a className="pill" data-active="true" href="/api/spotify/login">Connect Spotify</a>}
      </div>
      <small className="label">Lets Apollo search your music, read your Liked Songs and play a specific track on your PC. Playing an exact song needs Premium and the Spotify app open (Apollo opens it). Sign-in tokens stay on the server.</small>
      </>}
    </div>
  );
}

type Rule = { id: string; label: string; category: string; pattern: string; enabled: boolean; uses: number; last_used_at: string | null; created_at: string };
export function PcRulesBlock() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const load = () => fetch("/api/pc/rules").then((r) => (r.ok ? r.json() : null)).then((j) => setRules(j?.rules ?? [])).catch(() => setRules([]));
  useEffect(() => { void load(); }, []);
  const act = async (body: object) => { await post("/api/pc/rules", body); void load(); };
  if (!rules) return <div className="label">Loading…</div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <small className="label">Commands you chose &ldquo;Always allow this type&rdquo; for run without asking. Each rule covers one kind of action (e.g. launching apps) on every app and site except sensitive ones (password managers, banking, system tools, account and admin pages), which always ask. Deleting, installing, downloading, killing programs, system settings, admin and secrets always ask, whatever the rules say.</small>
      {rules.length === 0 ? <div className="label">No rules yet.</div> : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {rules.map((r) => (
            <li key={r.id} className={u.row} style={{ padding: "8px 10px", borderRadius: 8, background: "var(--surface)", opacity: r.enabled ? 1 : 0.6 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={r.enabled} onChange={(e) => act({ action: "toggle", id: r.id, enabled: e.target.checked })} />
                <b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</b>
              </label>
              <small className="label">used {r.uses}× · last {when(r.last_used_at)}</small>
              <button className="pill" onClick={() => act({ action: "delete", id: r.id })}>🗑 Delete</button>
            </li>
          ))}
        </ul>
      )}
      {rules.length > 0 && <button className="pill" style={{ justifySelf: "start" }} onClick={() => { if (confirm("Remove every always-allow rule?")) void act({ action: "revoke_all" }); }}>Revoke all</button>}
    </div>
  );
}
