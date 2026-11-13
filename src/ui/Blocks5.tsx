"use client";
// Knowledge sources for Apollo (websites, pasted text, PDF/text files) and a water tracker.

import { useEffect, useState } from "react";
import type { BlockCtx } from "./Blocks";
import u from "./ui.module.css";

const field: React.CSSProperties = { height: 34, padding: "0 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" };
const SUBJ = ["", "Maths", "Further Maths", "Physics", "Economics", "Mandarin", "Spanish", "French", "Fitness", "Nutrition", "Chess", "Poker", "General"];
type Src = { id: string; title: string; url: string | null; kind: string; subject: string | null; topic: string | null; chunks: number; at: string };
const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

async function pdfText(file: File) {
  const pdfjs = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS.replace("pdf.min.mjs", "pdf.worker.min.mjs");
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 300); i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.map((x: { str?: string; hasEOL?: boolean }) => (x.str ?? "") + (x.hasEOL ? "\n" : " ")).join(""));
  }
  return pages.join("\n\n");
}

export function KnowledgeBlock() {
  const [list, setList] = useState<Src[] | null>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState({ subject: "", topic: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/knowledge").then((r) => (r.ok ? r.json() : [])).then(setList).catch(() => setList([]));
  useEffect(() => { void load(); }, []);
  const post = async (body: object) => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/knowledge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, ...meta }) }).then((x) => x.json()).catch(() => ({ error: "couldn't reach the server" }));
    setBusy(false);
    setMsg(r.error ?? `Added "${r.title}" (${r.saved} sections). Apollo can use it now.`);
    void load();
    return !r.error;
  };
  const onFile = async (f: File) => {
    try {
      setBusy(true); setMsg(`Reading ${f.name}…`);
      const t = /\.pdf$/i.test(f.name) ? await pdfText(f) : await f.text();
      await post({ title: f.name.replace(/\.[^.]+$/, ""), text: t, kind: "file" });
    } catch (e) { setBusy(false); setMsg(`Couldn't read that file: ${(e as Error).message}`); }
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p className="label" style={{ margin: 0 }}>Anything here becomes part of what Apollo knows: it searches these sources when you ask related questions (in chat, tutor mode, marking and question writing) and cites them. Only the relevant sections are read each time, so it doesn&apos;t cost many tokens.</p>
      <div className={u.row}>
        <select style={field} value={meta.subject} onChange={(e) => setMeta({ ...meta, subject: e.target.value })}>{SUBJ.map((x) => <option key={x} value={x}>{x || "Subject (optional)"}</option>)}</select>
        <input style={field} placeholder="Topic (optional)" value={meta.topic} onChange={(e) => setMeta({ ...meta, topic: e.target.value })} />
      </div>
      <div className={u.row}>
        <input style={{ ...field, flex: 1 }} placeholder="Website link (revision site, article, spec page…)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="pill" data-active="true" disabled={busy || !/^https?:\/\//.test(url.trim())} onClick={async () => { if (await post({ url })) setUrl(""); }}>Add website</button>
        <label className="pill" style={{ cursor: "pointer" }}>Add file (PDF, txt, md)<input type="file" hidden accept=".pdf,.txt,.md,.csv,.html" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} /></label>
      </div>
      <input style={field} placeholder="Title for pasted text" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={4} placeholder="…or paste text (notes, an article, a mark scheme, your coach's advice)" value={text} onChange={(e) => setText(e.target.value)} style={{ ...field, height: "auto", padding: 8 }} />
      <div className={u.row}>
        <button className="pill" disabled={busy || text.trim().length < 80} onClick={async () => { if (await post({ title: title || "Pasted text", text })) { setText(""); setTitle(""); } }}>Add text</button>
        {msg && <span className="label">{msg}</span>}
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        <span className="label">{list?.length ?? 0} sources · {list?.reduce((a, s) => a + s.chunks, 0) ?? 0} sections</span>
        {list?.map((s) => (
          <div key={s.id} className={u.row} style={{ fontSize: 13, padding: "6px 8px", borderRadius: 8, background: "var(--surface)" }}>
            <span style={{ flex: 1 }}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title} <small className="label">{s.kind} · {s.chunks} sections{s.subject ? ` · ${s.subject}` : ""}{s.topic ? ` › ${s.topic}` : ""}</small></span>
            <button className="pill" onClick={async () => { await fetch(`/api/knowledge?id=${s.id}`, { method: "DELETE" }); void load(); }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WaterBlock({ ctx }: { ctx: BlockCtx }) {
  const rows = (ctx.data?.rows ?? []) as unknown as { ml: number; created_at: string }[];
  const today = new Date().toDateString();
  const ml = rows.filter((r) => new Date(r.created_at).toDateString() === today).reduce((a, r) => a + Number(r.ml), 0);
  const goal = 2500;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row}><span className="display" style={{ fontSize: 30 }}>{(ml / 1000).toFixed(2)} L</span><span className="label">of {goal / 1000} L today</span></div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)" }}><div style={{ width: `${Math.min(100, (ml / goal) * 100)}%`, height: "100%", borderRadius: 4, background: "var(--accent)" }} /></div>
      <div className={u.row}>{[250, 330, 500, 750].map((x) => <button key={x} className="pill" onClick={() => ctx.write("create", "water_logs", { ml: x })}>+{x} ml</button>)}</div>
    </div>
  );
}
