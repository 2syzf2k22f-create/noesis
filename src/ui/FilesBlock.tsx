"use client";
// Library > Files: a file manager. Upload (button or drag and drop), new text files, rename, edit with
// version history, star, folders and tags, duplicate, search names AND contents, filters, sort,
// grid/list, preview (Markdown, code, images, PDFs), download (one, or many as a zip), trash with
// restore, and shortcuts to Apollo (ask about it, flashcards, knowledge).

import { FxButton } from "./MathTools";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { readAttachment } from "@/shell/files";
import { Markdown } from "./Blocks";
import u from "./ui.module.css";

type F = { id: string; name: string; mime: string | null; size_bytes: number | null; source: string | null; project: string | null; folder: string | null; tags: string[] | null; subject: string | null; starred: boolean; storage_path: string | null; has_content: boolean; versions: number; created_at: string; updated_at: string | null; deleted_at: string | null; snippet: string | null };
type Kind = "md" | "code" | "pdf" | "image" | "text" | "other";
const kindOf = (f: F): Kind => {
  const n = f.name.toLowerCase(), m = f.mime ?? "";
  if (/\.(md|markdown)$/.test(n) || m.includes("markdown")) return "md";
  if (/\.pdf$/.test(n) || m.includes("pdf")) return "pdf";
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(n)) return "image";
  if (/\.(js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|sh|sql|json|ya?ml|xml|html?|css|toml|ini|tex)$/.test(n)) return "code";
  if (f.has_content || m.startsWith("text/")) return "text";
  return "other";
};
const ICON: Record<Kind, string> = { md: "📝", code: "⌨", pdf: "📕", image: "🖼", text: "📄", other: "📦" };
const size = (b: number | null) => (b == null ? "–" : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "");
const api = (body: object) => fetch("/api/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }));
const field: React.CSSProperties = { height: 32, padding: "0 10px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", font: "13px var(--font-body)" };
const mark = (text: string, q: string) => {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? text : <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
};

export function FilesBlock() {
  const { submit } = useApollo();
  const [files, setFiles] = useState<F[] | null>(null);
  const [totals, setTotals] = useState<{ count: number; bytes: number; stored: number } | null>(null);
  const [limit, setLimit] = useState(25 * 1048576);
  const [q, setQ] = useState("");
  const [trash, setTrash] = useState(false);
  const [type, setType] = useState<Kind | "">("");
  const [source, setSource] = useState("");
  const [folder, setFolder] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [sort, setSort] = useState<"new" | "old" | "name" | "size" | "edited">("new");
  const [grid, setGrid] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<F | null>(null);
  const [msg, setMsg] = useState<{ text: string; undo?: () => void; tone?: "bad" } | null>(null);
  const [busy, setBusy] = useState(0);
  const [drag, setDrag] = useState(false);
  const [creating, setCreating] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = () => fetch(`/api/files?q=${encodeURIComponent(q)}${trash ? "&trash=1" : ""}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j) { setMsg({ text: "Couldn't load files (database not connected?).", tone: "bad" }); return; }
    setFiles(j.files); setTotals(j.totals); setLimit(j.limit_bytes ?? limit);
  }).catch(() => {});
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, trash]); // eslint-disable-line react-hooks/exhaustive-deps

  const folders = useMemo(() => [...new Set((files ?? []).flatMap((f) => [f.folder, f.project, f.subject, ...(f.tags ?? [])]).filter(Boolean) as string[])].sort(), [files]);
  const sources = useMemo(() => [...new Set((files ?? []).map((f) => f.source ?? "apollo"))].sort(), [files]);
  const shown = useMemo(() => (files ?? [])
    .filter((f) => (!type || kindOf(f) === type) && (!source || (f.source ?? "apollo") === source) && (!starredOnly || f.starred)
      && (!folder || [f.folder, f.project, f.subject, ...(f.tags ?? [])].includes(folder))
      && (!from || f.created_at >= from) && (!to || f.created_at.slice(0, 10) <= to))
    .sort((a, b) => (Number(b.starred) - Number(a.starred)) || (
      sort === "new" ? b.created_at.localeCompare(a.created_at) : sort === "old" ? a.created_at.localeCompare(b.created_at)
        : sort === "name" ? a.name.localeCompare(b.name) : sort === "size" ? Number(b.size_bytes ?? 0) - Number(a.size_bytes ?? 0)
          : String(b.updated_at ?? b.created_at).localeCompare(String(a.updated_at ?? a.created_at)))), [files, type, source, starredOnly, folder, from, to, sort]);

  /* ---------- actions ---------- */
  const upload = async (list: Iterable<File>) => {
    const errs: string[] = [];
    let n = 0;
    for (const f of list) {
      setBusy((b) => b + 1);
      try {
        if (f.size > limit) { errs.push(`${f.name} is ${size(f.size)}: the limit is ${size(limit)}.`); continue; }
        // keep the text of documents too, so search and Apollo can read them
        let text: string | undefined;
        try { const a = await readAttachment(f); text = a.text; } catch { /* images, unsupported: no text */ }
        const isText = /^text\/|json|xml|javascript/.test(f.type) || /\.(md|txt|csv|json|js|ts|py|html?|css)$/i.test(f.name);
        if (isText && f.size < 2_000_000) {
          const r = await api({ action: "create", name: f.name, content: await f.text(), mime: f.type || undefined });
          if (r.error) errs.push(r.error); else n++;
          continue;
        }
        const r = await api({ action: "upload_url", name: f.name, size: f.size, mime: f.type, text });
        if (r.error) { errs.push(r.error); continue; }
        const put = await fetch(r.upload, { method: "PUT", body: f, headers: { "content-type": f.type || "application/octet-stream", "x-upsert": "true" } });
        if (!put.ok) { errs.push(`${f.name}: upload failed (${put.status}).`); await api({ action: "delete", id: r.file.id }); await api({ action: "purge", id: r.file.id }); continue; }
        n++;
      } finally { setBusy((b) => b - 1); }
    }
    setMsg(errs.length ? { text: `${n ? `Uploaded ${n}. ` : ""}${errs.join(" ")}`, tone: "bad" } : { text: `Uploaded ${n} file${n === 1 ? "" : "s"}.` });
    void load();
  };
  const del = async (ids: string[]) => {
    await api({ action: "delete", ids });
    setSel(new Set()); if (open && ids.includes(open.id)) setOpen(null);
    setMsg({ text: `Deleted ${ids.length} file${ids.length === 1 ? "" : "s"}.`, undo: async () => { await api({ action: "restore", ids }); setMsg(null); void load(); } });
    void load();
  };
  const update = async (f: F, patch: object) => { const r = await api({ action: "update", id: f.id, ...patch }); if (r.file) { setOpen((o) => (o?.id === f.id ? { ...o, ...r.file } : o)); } void load(); };
  const zip = async (ids: string[]) => {
    setBusy((b) => b + 1);
    try {
      const { zipSync } = await import("fflate");
      const out: Record<string, Uint8Array> = {};
      for (const id of ids) {
        const f = files?.find((x) => x.id === id);
        if (!f) continue;
        const r = await fetch(`/api/files/${id}`);
        if (r.ok) { let name = f.name; for (let i = 1; out[name]; i++) name = f.name.replace(/(\.[^.]+)?$/, ` (${i})$1`); out[name] = new Uint8Array(await r.arrayBuffer()); }
      }
      const blob = new Blob([zipSync(out) as BlobPart], { type: "application/zip" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `noesis-files-${new Date().toISOString().slice(0, 10)}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally { setBusy((b) => b - 1); }
  };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!files) return <div className="label">{msg?.text ?? "Loading…"}</div>;
  return (
    <div style={{ display: "grid", gap: 12, outline: drag ? "2px dashed var(--accent)" : "none", borderRadius: 12, padding: drag ? 6 : 0 }}
      onDragOver={(e) => { if (!trash) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (!trash && e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}>
      {/* header: totals + main actions */}
      <div className={u.row} style={{ flexWrap: "wrap" }}>
        {totals && <span className="label">{totals.count} files · {size(totals.bytes)} total · {size(totals.stored)} in storage · up to {size(limit)} each</span>}
        <span style={{ flex: 1 }} />
        {!trash && <>
          <button className="pill" data-active="true" onClick={() => input.current?.click()}>⬆ Upload</button>
          <input ref={input} type="file" multiple hidden onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ""; }} />
          <button className="pill" onClick={() => setCreating(true)}>＋ New file</button>
        </>}
        <button className="pill" data-active={trash} onClick={() => { setTrash(!trash); setSel(new Set()); setOpen(null); }}>{trash ? "← Back to files" : "🗑 Trash"}</button>
      </div>

      {/* search, filters, sort */}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search file names and contents…" style={{ ...field, height: 38, width: "100%" }} />
      <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
        <select value={type} onChange={(e) => setType(e.target.value as Kind | "")} style={field}><option value="">All types</option>{(["md", "code", "pdf", "image", "text", "other"] as Kind[]).map((k) => <option key={k} value={k}>{ICON[k]} {k}</option>)}</select>
        <select value={source} onChange={(e) => setSource(e.target.value)} style={field}><option value="">Anyone</option>{sources.map((s2) => <option key={s2} value={s2}>{s2 === "me" ? "Me" : s2}</option>)}</select>
        <select value={folder} onChange={(e) => setFolder(e.target.value)} style={field}><option value="">All folders & tags</option>{folders.map((f) => <option key={f}>{f}</option>)}</select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={field} title="From" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={field} title="To" />
        <button className="pill" data-active={starredOnly} onClick={() => setStarredOnly(!starredOnly)}>★ Starred</button>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={field}>
          <option value="new">Newest</option><option value="old">Oldest</option><option value="name">Name</option><option value="size">Size</option><option value="edited">Last edited</option>
        </select>
        <button className="pill" onClick={() => setGrid(!grid)}>{grid ? "☰ List" : "▦ Grid"}</button>
      </div>

      {msg && <div className={u.row} style={{ padding: "6px 10px", borderRadius: 8, background: "var(--surface)", color: msg.tone === "bad" ? "var(--danger)" : undefined }}>
        <span style={{ flex: 1 }}>{msg.text}</span>{msg.undo && <button className="pill" onClick={msg.undo}>Undo</button>}<button className="pill" onClick={() => setMsg(null)}>✕</button></div>}
      {busy > 0 && <div className="label">Working on {busy} file{busy === 1 ? "" : "s"}…</div>}

      {sel.size > 0 && (
        <div className={u.row} style={{ flexWrap: "wrap" }}>
          <b>{sel.size} selected</b>
          {trash ? <>
            <button className="pill" onClick={async () => { await api({ action: "restore", ids: [...sel] }); setSel(new Set()); void load(); }}>↺ Restore</button>
            <button className="pill" onClick={async () => { if (confirm(`Delete ${sel.size} file(s) forever? This can't be undone.`)) { await api({ action: "purge", ids: [...sel] }); setSel(new Set()); void load(); } }}>Delete forever</button>
          </> : <>
            <button className="pill" onClick={() => del([...sel])}>🗑 Delete selected</button>
            <button className="pill" onClick={() => zip([...sel])}>⬇ Download as zip</button>
          </>}
          <button className="pill" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className={u.nodata} style={{ padding: 24, textAlign: "center" }}>{trash ? "The trash is empty." : q || type || folder || starredOnly ? "No files match." : "No files yet: drop some here, or press Upload."}</div>
      ) : grid ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {shown.map((f) => (
            <div key={f.id} onClick={() => setOpen(f)} style={{ cursor: "pointer", padding: 10, borderRadius: 10, background: "var(--surface)", border: `1px solid ${sel.has(f.id) ? "var(--accent)" : "var(--border)"}`, display: "grid", gap: 4, minWidth: 0 }}>
              <div className={u.row}><input type="checkbox" checked={sel.has(f.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(f.id)} /><span style={{ fontSize: 26 }}>{ICON[kindOf(f)]}</span>{f.starred && <span>★</span>}</div>
              <b style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mark(f.name, q)}</b>
              <small className="label">{size(f.size_bytes)} · {when(f.created_at)}</small>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          <label className="label" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={sel.size === shown.length} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((f) => f.id)) : new Set())} /> Select all</label>
          {shown.map((f) => (
            <div key={f.id} className={u.row} onClick={() => setOpen(f)} style={{ cursor: "pointer", padding: "8px 10px", borderRadius: 8, background: open?.id === f.id ? "var(--surface-2)" : "var(--surface)", alignItems: "flex-start", minWidth: 0 }}>
              <input type="checkbox" checked={sel.has(f.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(f.id)} />
              <span>{ICON[kindOf(f)]}</span>
              <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
                <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.starred && "★ "}{mark(f.name, q)}</b>
                {f.snippet && <small style={{ color: "var(--text-dim)" }}>{mark(f.snippet, q)}</small>}
                <small className="label">{size(f.size_bytes)} · {f.source === "me" ? "you" : f.source ?? "apollo"} · {when(f.created_at)}{f.folder ? ` · 📁 ${f.folder}` : ""}{(f.tags ?? []).map((t) => ` · #${t}`).join("")}{trash && f.deleted_at ? ` · deleted ${when(f.deleted_at)}` : ""}</small>
              </div>
              {trash && <button className="pill" onClick={async (e) => { e.stopPropagation(); await api({ action: "restore", id: f.id }); void load(); }}>↺ Restore</button>}
            </div>
          ))}
        </div>
      )}

      {creating && <NewFile onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} />}
      {open && <Preview f={open} trash={trash} folders={folders} onClose={() => setOpen(null)} onUpdate={(p) => update(open, p)} onDelete={() => del([open.id])} onChanged={load}
        onAsk={(text) => { submit(text, { files: [] }); }} />}
    </div>
  );
}

function NewFile({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("Untitled.md");
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal onClose={onClose} title="New file">
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...field, width: "100%" }} />
      <div className={u.row}><FxButton target={() => document.getElementById("newfile-box") as HTMLTextAreaElement | null} value={text} set={setText} /><small className="label">Maths: $x^2$ inline, $$x^2$$ on its own line</small></div>
      <textarea id="newfile-box" value={text} onChange={(e) => setText(e.target.value)} rows={16} placeholder="Write Markdown or plain text…" style={{ ...field, height: "auto", padding: 10, width: "100%", fontFamily: "var(--font-mono, monospace)" }} />
      {err && <div style={{ color: "var(--danger)" }}>{err}</div>}
      <div className={u.row}><button className="pill" data-active="true" onClick={async () => { const r = await api({ action: "create", name, content: text }); if (r.error) setErr(r.error); else onSaved(); }}>Save</button><button className="pill" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-label={title} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "min(860px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 16, display: "grid", gap: 10, background: "var(--bg)" }}>
        <div className={u.row}><b style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{title}</b><button className="pill" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

function Preview({ f, trash, folders, onClose, onUpdate, onDelete, onChanged, onAsk }: { f: F; trash: boolean; folders: string[]; onClose: () => void; onUpdate: (p: object) => void; onDelete: () => void; onChanged: () => void; onAsk: (t: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");
  const [vers, setVers] = useState<{ i: number; at: string; chars: number; preview: string }[] | null>(null);
  const [copied, setCopied] = useState(false);
  const k = kindOf(f);
  const url = `/api/files/${f.id}`;
  useEffect(() => { if (["md", "code", "text"].includes(k)) fetch(url).then((r) => (r.ok ? r.text() : "")).then(setText).catch(() => setText("")); }, [url, k]);
  const save = async () => { await api({ action: "edit", id: f.id, content: draft }); setText(draft); setEdit(false); onChanged(); };
  const ask = (what: string) => { onAsk(`${what} — the file "${f.name}" in my Library › Files (id ${f.id}). Read it with read_saved_file.`); onClose(); };
  return (
    <Modal title={`${ICON[k]} ${f.name}`} onClose={onClose}>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
        {!trash && <>
          <a className="pill" href={`${url}?download=1`}>⬇ Download</a>
          {text != null && <button className="pill" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "⧉ Copy contents"}</button>}
          <button className="pill" onClick={() => { const n = prompt("Rename to", f.name); if (n && n !== f.name) onUpdate({ name: n }); }}>✎ Rename</button>
          <button className="pill" onClick={() => { const n = prompt(`Move to folder (existing: ${folders.join(", ") || "none"}). Leave empty for none.`, f.folder ?? ""); if (n !== null) onUpdate({ folder: n.trim() || null }); }}>📁 Move</button>
          <button className="pill" onClick={() => { const n = prompt("Tags, comma-separated", (f.tags ?? []).join(", ")); if (n !== null) onUpdate({ tags: n.split(",").map((t) => t.trim()).filter(Boolean) }); }}># Tags</button>
          <button className="pill" data-active={f.starred} onClick={() => onUpdate({ starred: !f.starred })}>{f.starred ? "★ Starred" : "☆ Star"}</button>
          <button className="pill" onClick={async () => { await api({ action: "duplicate", id: f.id }); onChanged(); }}>⎘ Duplicate</button>
          {text != null && !edit && <button className="pill" onClick={() => { setDraft(text); setEdit(true); }}>✎ Edit</button>}
          {f.versions > 0 && <button className="pill" onClick={async () => setVers((await api({ action: "versions", id: f.id })).versions ?? [])}>⟲ Versions ({f.versions})</button>}
          <button className="pill" onClick={onDelete}>🗑 Delete</button>
        </>}
      </div>
      {!trash && <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
        <button className="pill" onClick={() => ask("Answer questions about")}>Ask Apollo about this file</button>
        {k !== "image" && <button className="pill" onClick={() => ask("Make flashcards (save them to my decks) from")}>Make flashcards from this</button>}
        {k !== "image" && <TeachToggle id={f.id} />}
      </div>}
      {vers && (
        <div style={{ display: "grid", gap: 4 }}>
          {vers.length === 0 && <span className="label">No earlier versions.</span>}
          {vers.map((v) => <div key={v.i} className={u.row}><small className="label" style={{ flex: 1 }}>{when(v.at)} · {v.chars} chars · {v.preview.slice(0, 80)}</small><button className="pill" onClick={async () => { await api({ action: "restore_version", id: f.id, i: v.i }); setVers(null); setText(null); onChanged(); fetch(url).then((r) => r.text()).then(setText); }}>Restore</button></div>)}
        </div>
      )}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, minHeight: 200 }}>
        {edit ? (
          <div style={{ display: "grid", gap: 8 }}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={20} style={{ ...field, height: "auto", padding: 10, width: "100%", fontFamily: "var(--font-mono, monospace)" }} />
            <div className={u.row}><button className="pill" data-active="true" onClick={save}>Save</button><button className="pill" onClick={() => setEdit(false)}>Cancel</button></div>
          </div>
        ) : k === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={f.name} style={{ maxWidth: "100%", borderRadius: 8 }} />
        ) : k === "pdf" ? (
          <iframe src={url} title={f.name} style={{ width: "100%", height: "70vh", border: 0, borderRadius: 8, background: "#fff" }} />
        ) : text == null && ["md", "code", "text"].includes(k) ? <span className="label">Loading…</span>
          : k === "md" ? <Markdown text={text ?? ""} />
            : k === "code" || k === "text" ? <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, margin: 0, maxHeight: "65vh", overflow: "auto" }}>{text}</pre>
              : <span className="label">No preview for this type. Download it to open.</span>}
      </div>
    </Modal>
  );
}

/** Teach Apollo: this file's text joins his knowledge sources (searched when he answers); off removes it. */
function TeachToggle({ id }: { id: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { void api({ action: "teach_status", id }).then((r) => setOn(!!r.on)); }, [id]);
  if (on == null) return null;
  return (
    <label className="pill" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }} title="Apollo searches this file's text when answering you">
      <input type="checkbox" checked={on} onChange={async (e) => { setMsg("…"); const r = await api({ action: "teach", id, on: e.target.checked }); setOn(!!r.on); setMsg(r.error ?? (r.on ? `${r.sections} sections` : "")); }} />
      Teach Apollo{msg ? ` · ${msg}` : ""}
    </label>
  );
}
