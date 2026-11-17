"use client";
// Library › Documents: everything Apollo has made (projects, CVs, reports, posters, slides, revision sheets),
// and a form to ask for a new one.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApollo } from "@/shell/apollo";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const KINDS: [string, string][] = [["project", "School project"], ["report", "Report"], ["essay", "Essay"], ["cv", "CV"], ["letter", "Letter / personal statement"], ["poster", "Poster"], ["slides", "Slides"], ["revision", "Revision sheet"], ["worksheet", "Worksheet"], ["article", "Article"]];
const field: React.CSSProperties = { height: 34, padding: "0 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" };

export function DocumentsBlock() {
  const { submit, changes } = useApollo();
  const [docs, setDocs] = useState<A[]>([]);
  const [f, setF] = useState({ kind: "project", topic: "", detail: "", theme: "modern" });
  useEffect(() => { fetch("/api/docs").then((r) => r.json()).then((j) => setDocs(Array.isArray(j) ? j : [])).catch(() => {}); }, [changes]);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 8, padding: 14, borderRadius: 12, background: "var(--surface)" }}>
        <b>Make a document</b>
        <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} style={field}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })} style={field}>{["modern", "classic", "academic", "minimal", "bold"].map((t) => <option key={t}>{t}</option>)}</select>
          <input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="What it's about" style={{ ...field, flex: 1, minWidth: 220 }} />
        </div>
        <textarea value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} rows={3} placeholder="Anything it must include: length, audience, sections, facts about you (for a CV), the brief (for a project)…" style={{ ...field, height: "auto", padding: 8 }} />
        <button className="pill" data-active="true" disabled={!f.topic.trim()} style={{ justifySelf: "start" }} onClick={() => submit(`Make me a ${KINDS.find((k) => k[0] === f.kind)?.[1]} (kind ${f.kind}, theme ${f.theme}) about: ${f.topic}. ${f.detail}\nResearch it properly (WebSearch / web_read for facts and sources), use real pictures and diagrams (figures with a search query, or your own \`\`\`mermaid / \`\`\`chart / \`\`\`plot), a smart layout, and make it look like a real finished piece of work. Save it with make_document and open it.`, { mode: "chat" })}>Make it</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {docs.map((d) => <Link key={d.id} href={`/doc/${d.id}`} style={{ padding: 12, borderRadius: 12, background: "var(--surface)", display: "grid", gap: 4, textDecoration: "none", color: "inherit" }}><b>{d.title}</b><small className="label">{d.kind} · {d.sections} sections · {new Date(d.date).toLocaleDateString("en-GB")}</small></Link>)}
        {!docs.length && <small className="label">No documents yet.</small>}
      </div>
    </div>
  );
}
