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

type Rule = { id?: string; kind: string; label: string; weekday: number; start: string; end_time?: string | null; lead_minutes: number; link?: string | null; active: boolean; scheduled?: number; next?: string | null };
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Recurring reminders (workouts, study hours): kept 28 days ahead automatically. */
export function RecurringRemindersBlock() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [edit, setEdit] = useState<Rule | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => fetch("/api/reminders").then((r) => r.json()).then((j) => setRules(j.rules ?? [])).catch(() => setRules([]));
  useEffect(() => { void load(); }, []);
  const save = async (r: Rule) => { const j = await post("/api/reminders", { action: "save", rule: r }); if (j?.error) setErr(j.error); else { setErr(null); setEdit(null); void load(); } };
  const f: React.CSSProperties = { height: 30, padding: "0 6px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" };
  if (!rules) return <div className="label">Loading…</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <small className="label">Each rule sends an inbox reminder before every session, every week (UK time, summer time handled). They&apos;re topped up daily to 28 days ahead, so they never run out.</small>
      {rules.map((r) => (
        <div key={r.id} className={u.row} style={{ padding: "6px 10px", borderRadius: 8, background: "var(--surface)", opacity: r.active ? 1 : 0.55, flexWrap: "wrap", gap: 6 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, minWidth: 200 }}>
            <input type="checkbox" checked={r.active} onChange={(e) => save({ ...r, active: e.target.checked })} title={r.active ? "Pause" : "Resume"} />
            <b>{WD[r.weekday - 1]} {r.start}</b> {r.kind === "workout" ? `Workout: ${r.label}` : r.label}
          </label>
          <small className="label">{r.lead_minutes} min before · {r.active ? `${r.scheduled ?? 0} scheduled${r.next ? `, next ${new Date(r.next).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}` : ""}` : "paused"}</small>
          <button className="pill" onClick={() => setEdit(r)}>Edit</button>
          <button className="pill" onClick={async () => { if (confirm("Delete this rule and its upcoming reminders?")) { await post("/api/reminders", { action: "delete", id: r.id }); void load(); } }}>🗑</button>
        </div>
      ))}
      {edit ? (
        <div className={u.row} style={{ flexWrap: "wrap", gap: 6, padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}>
          <select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })} style={f}><option value="workout">workout</option><option value="study">study</option><option value="other">other</option></select>
          <input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Label" style={{ ...f, width: 130 }} />
          <select value={edit.weekday} onChange={(e) => setEdit({ ...edit, weekday: Number(e.target.value) })} style={f}>{WD.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}</select>
          <input type="time" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} style={f} />
          <input type="time" value={edit.end_time ?? ""} onChange={(e) => setEdit({ ...edit, end_time: e.target.value })} style={f} title="End (optional)" />
          <label className="label"><input type="number" min={0} max={240} value={edit.lead_minutes} onChange={(e) => setEdit({ ...edit, lead_minutes: Number(e.target.value) })} style={{ ...f, width: 60 }} /> min before</label>
          <button className="pill" data-active="true" onClick={() => save(edit)}>Save</button>
          <button className="pill" onClick={() => setEdit(null)}>Cancel</button>
          {err && <small style={{ color: "var(--danger)" }}>{err}</small>}
        </div>
      ) : <button className="pill" style={{ justifySelf: "start" }} onClick={() => setEdit({ kind: "study", label: "Study hour", weekday: 1, start: "17:00", lead_minutes: 30, active: true, link: "/s/school/revise" })}>＋ Add a rule</button>}
    </div>
  );
}
