"use client";
// Share a flashcard deck, a question-bank topic (as a quiz) or a document with a friend: a read-only link,
// optionally expiring. Every link can be switched off.
import { useEffect, useState } from "react";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const field: React.CSSProperties = { height: 32, padding: "0 8px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" };
export async function makeShare(kind: string, ref_id: string, title: string, days?: number) {
  const r = await fetch("/api/shares", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, ref_id, title, days }) }).then((x) => x.json());
  if (r.url) { const full = location.origin + r.url; try { await navigator.clipboard.writeText(full); } catch {} return full; }
  return null;
}
export function ShareManager({ p }: { p?: A }) {
  const [links, setLinks] = useState<A[]>([]);
  const [opts, setOpts] = useState<{ decks: string[]; topics: string[] }>({ decks: [], topics: [] });
  const [f, setF] = useState({ kind: p?.kind ?? "deck", ref: "", days: 30 });
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/shares").then((r) => r.json()).then((j) => setLinks(Array.isArray(j) ? j : [])).catch(() => {});
  useEffect(() => {
    void load();
    fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "flashcards", limit: 500 }, { table: "questions", limit: 500 }] }) }).then((r) => r.json())
      .then((j) => setOpts({ decks: [...new Set<string>((j?.[0]?.rows ?? []).map((c: A) => c.deck).filter(Boolean))], topics: [...new Set<string>((j?.[1]?.rows ?? []).map((q: A) => `${q.subject}|${q.topic ?? ""}`))] })).catch(() => {});
  }, []);
  const list = f.kind === "deck" ? opts.decks : opts.topics;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, ref: "" })} style={field}><option value="deck">Flashcard deck</option><option value="quiz">Questions (as a quiz)</option></select>
        <select value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} style={field}><option value="">Choose…</option>{list.map((x) => <option key={x} value={x}>{x.replace("|", ": ")}</option>)}</select>
        <select value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} style={field}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={0}>No expiry</option></select>
        <button className="pill" data-active="true" disabled={!f.ref} onClick={async () => { const url = await makeShare(f.kind, f.ref, f.ref.replace("|", ": "), f.days || undefined); setMsg(url ? `Link copied: ${url}` : "Couldn't make a link."); void load(); }}>Make a link</button>
      </div>
      {msg && <small className="label" style={{ wordBreak: "break-all" }}>{msg}</small>}
      {links.map((l) => <div key={l.token} className={u.row} style={{ gap: 8, fontSize: 13 }}><span style={{ flex: 1 }}>{l.kind}: {l.title || l.ref_id} <small className="label">· {l.views} views{l.expires_at ? ` · until ${new Date(l.expires_at).toLocaleDateString("en-GB")}` : ""}</small></span><button className="pill" onClick={() => { void navigator.clipboard.writeText(`${location.origin}/share/${l.token}`); setMsg("Copied."); }}>Copy</button><button className="pill" onClick={async () => { await fetch("/api/shares", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revoke: l.token }) }); void load(); }}>Switch off</button></div>)}
    </div>
  );
}
