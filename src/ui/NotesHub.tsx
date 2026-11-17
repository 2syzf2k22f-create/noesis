"use client";
// Notes: lesson notes and topic notes, organised by subject -> topic (and spec code), with a Markdown + maths
// editor (live preview, autosave, version history), templates (Cornell, summary, lesson, mind map, formula
// sheet, exam technique), links and videos per topic, tags, pins, colours, and Apollo built in: notes ->
// flashcards (following your own instructions), quiz me, explain/expand, tidy up, summarise, and a chat about
// the note. Notes can join your spaced-repetition reviews, be read aloud, and be exported or printed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { RichText } from "./RichText";
import { RoomChat } from "./RoomChat";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const SUBJ = ["Maths", "Further Maths", "Physics", "Economics", "Other"];
const api = (b: object) => fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
const field: React.CSSProperties = { height: 32, padding: "0 8px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" };
const COLORS = ["", "#3ee0ff", "#f5a524", "#30a46c", "#e5484d", "#9b8cff"];
const TEMPLATES: Record<string, string> = {
  Blank: "",
  Lesson: "## Lesson: {topic}\n**Date:** {date}\n\n### Key ideas\n- \n\n### Worked example\n\n### Questions I still have\n- \n\n### Homework / next steps\n- ",
  Cornell: "| Cues / questions | Notes |\n|---|---|\n|  |  |\n|  |  |\n\n### Summary\n",
  Summary: "## {topic}\n### In one sentence\n\n### Key points\n1. \n2. \n3. \n\n### Formulas\n$$ $$\n\n### Common mistakes\n- \n\n### Exam tips\n- ",
  "Mind map": "```mermaid\nmindmap\n  root(({topic}))\n    Idea 1\n      Detail\n    Idea 2\n    Idea 3\n```\n",
  "Formula sheet": "## {topic}: formulas\n| Formula | When to use | Units / notes |\n|---|---|---|\n| $ $ |  |  |\n",
  "Exam technique": "## {topic}: exam technique\n### Command words\n- **Explain:** \n- **Evaluate:** \n\n### How marks are given\n- \n\n### Model answer\n",
  Definitions: "## {topic}: definitions\n- **Term**: definition\n- **Term**: definition\n",
};

export function NotesHub() {
  const { submit } = useApollo();
  const [list, setList] = useState<A[]>([]);
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [map, setMap] = useState<string | null>(null);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => { const t = setTimeout(() => fetch(`/api/notes${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((r) => r.json()).then((j) => setList(Array.isArray(j) ? j : [])).catch(() => {}), q ? 250 : 0); return () => clearTimeout(t); }, [q, tick]);
  useEffect(() => { const id = new URLSearchParams(location.search).get("note"); if (id) queueMicrotask(() => setOpenId(id)); }, []);
  const shown = list.filter((n) => (subject === "all" || (n.subject ?? "Other") === subject) && (kind === "all" || n.kind === kind || (kind === "pinned" && n.pinned) || (kind === "review" && n.review)));
  // subject -> topic tree
  const tree = useMemo(() => {
    const m = new Map<string, A[]>();
    for (const n of shown) { const k = n.topic || "(no topic)"; m.set(k, [...(m.get(k) ?? []), n]); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [shown]);
  const create = async (template = "Blank", extra: object = {}) => {
    const topic = (extra as A).topic ?? "";
    const body = (TEMPLATES[template] ?? "").replace(/\{topic\}/g, topic || "Topic").replace(/\{date\}/g, new Date().toLocaleDateString("en-GB"));
    const n = await api({ action: "create", title: template === "Lesson" ? `Lesson ${new Date().toLocaleDateString("en-GB")}` : topic || "Untitled note", kind: template === "Lesson" ? "lesson" : "topic", subject: subject !== "all" ? subject : "Maths", template, body, lesson_date: template === "Lesson" ? new Date().toISOString().slice(0, 10) : null, ...extra });
    reload(); setOpenId(n.id);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 280px) minmax(0, 1fr)", gap: 14 }} className={u.studyGrid}>
      <aside style={{ display: "grid", gap: 8, alignContent: "start" }}>
        <div className={u.row} style={{ gap: 6 }}>
          <button className="pill" data-active="true" style={{ flex: 1, height: 38 }} onClick={() => void create("Blank")}>＋ New note</button>
          <button className="pill" style={{ height: 38 }} onClick={() => void create("Lesson")} title="A lesson note dated today">＋ Lesson</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all notes…" style={field} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{["all", ...SUBJ].map((s) => <button key={s} className="pill" style={{ height: 24, fontSize: 11 }} data-active={subject === s} onClick={() => setSubject(s)}>{s === "all" ? "All" : s}</button>)}</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{[["all", "All"], ["lesson", "Lesson"], ["topic", "Topic"], ["pinned", "📌 Pinned"], ["review", "🔁 In reviews"]].map(([k, l]) => <button key={k} className="pill" style={{ height: 24, fontSize: 11 }} data-active={kind === k} onClick={() => setKind(k)}>{l}</button>)}</div>
        <small className="label">{shown.length} note{shown.length === 1 ? "" : "s"}</small>
        <div style={{ display: "grid", gap: 8, maxHeight: "68vh", overflowY: "auto" }}>
          {shown.filter((n) => n.pinned).length > 0 && <div><span className="label">Pinned</span>{shown.filter((n) => n.pinned).map((n) => <NoteRow key={n.id} n={n} active={openId === n.id} onClick={() => setOpenId(n.id)} />)}</div>}
          {tree.map(([topic, ns]) => (
            <details key={topic} open={tree.length < 8 || ns.some((n) => n.id === openId)}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{topic} <small className="label">({ns.length})</small></summary>
              {ns.map((n) => <NoteRow key={n.id} n={n} active={openId === n.id} onClick={() => setOpenId(n.id)} />)}
            </details>
          ))}
          {!shown.length && <small className="label">No notes here yet. Start one, or ask Apollo to write notes from a lesson or a tutor session.</small>}
        </div>
        <button className="pill" onClick={() => setMap(subject === "all" ? "Maths" : subject)}>🧠 Spec mind map{subject !== "all" ? ` (${subject})` : ""}</button>
        <details><summary className="label" style={{ cursor: "pointer" }}>New from a template</summary><div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>{Object.keys(TEMPLATES).map((t) => <button key={t} className="pill" style={{ height: 26, fontSize: 12 }} onClick={() => { const topic = prompt("Topic?") ?? ""; void create(t, { topic }); }}>{t}</button>)}</div></details>
      </aside>
      <main style={{ minWidth: 0 }}>
        {openId ? <NoteEditor key={openId} id={openId} onChanged={reload} onDeleted={() => { setOpenId(null); reload(); }} submit={submit} />
          : <div style={{ padding: 18, borderRadius: 14, background: "var(--surface)", display: "grid", gap: 8 }}>
            <b style={{ fontSize: 18 }}>Your notes</b>
            <span className="label">Pick a note, or start one. Notes support headings, lists, tables, LaTeX maths ($x^2$), diagrams (```mermaid), graphs (```plot) and pasted images. Apollo can turn any note into flashcards, quiz you on it, explain it, or tidy it up.</span>
          </div>}
      </main>
      {map && <SpecMap subject={map} onClose={() => setMap(null)} />}
    </div>
  );
}
/** The whole spec for a subject as a mind map (headings and topics), from the imported spec statements. */
function SpecMap({ subject, onClose }: { subject: string; onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "spec_points", where: { subject }, limit: 500 }] }) }).then((r) => r.json()).then((j) => {
      const rows: A[] = (j?.[0]?.rows ?? []).filter((p: A) => p.level <= 3).sort((a: A, b: A) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
      const clean = (t: string) => String(t).replace(/[()[\]{}"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 42);
      const lines = [`mindmap`, `  root((${clean(subject)}))`, ...rows.map((p) => `${"  ".repeat(Math.min(3, Number(p.level)) + 1)}${clean(`${p.code} ${p.title ?? ""}`)}`)];
      setCode(rows.length ? lines.join("\n") : "");
    }).catch(() => setCode(""));
  }, [subject]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 330, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ background: "var(--bg)", padding: 16, width: "min(1100px, 96vw)", maxHeight: "90vh", overflow: "auto" }}>
        <b>{subject}: the spec as a mind map</b>
        {code == null ? <p className="label">Loading…</p> : code ? <RichText text={"```mermaid\n" + code + "\n```"} /> : <p className="label">No spec imported for {subject} yet (School › Spec).</p>}
      </div>
    </div>
  );
}
const NoteRow = ({ n, active, onClick }: { n: A; active: boolean; onClick: () => void }) => (
  <button onClick={onClick} className="pill" data-active={active} style={{ display: "grid", justifyItems: "start", textAlign: "left", height: "auto", padding: "6px 10px", width: "100%", marginTop: 4, borderLeft: n.color ? `3px solid ${n.color}` : undefined }}>
    <b style={{ fontSize: 13 }}>{n.pinned ? "📌 " : ""}{n.title}</b>
    <small className="label">{n.kind === "lesson" ? "lesson" : "topic"}{n.subject ? ` · ${n.subject}` : ""}{n.spec_code ? ` · ${n.spec_code}` : ""} · {n.words} words</small>
  </button>
);

function NoteEditor({ id, onChanged, onDeleted, submit }: { id: string; onChanged: () => void; onDeleted: () => void; submit: (t: string, o?: A) => void }) {
  const [n, setN] = useState<A>(null);
  const [mode, setMode] = useState<"split" | "edit" | "read">("split");
  const [saved, setSaved] = useState("");
  const [vers, setVers] = useState<A[] | null>(null);
  const [chat, setChat] = useState<string | null>(null);
  const [link, setLink] = useState({ title: "", url: "" });
  const [chatOpen, setChatOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { fetch(`/api/notes?id=${id}`).then((r) => r.json()).then((j) => { setN(j); setMode(j.body ? "read" : "split"); }).catch(() => {}); fetch(`/api/chats?space=notes:${id}`).then((r) => r.json()).then((j) => { if (Array.isArray(j) && j[0]) setChat(j[0].id); }).catch(() => {}); }, [id]);
  const save = useCallback((patch: A) => {
    setN((x: A) => ({ ...x, ...patch })); setSaved("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => { await api({ action: "update", id, ...patch }); setSaved("Saved"); onChanged(); }, 700);
  }, [id, onChanged]);
  if (!n) return <div className="label">Loading…</div>;
  const wrap = (a: string, b = a) => { const t = area.current; if (!t) return; const s = t.selectionStart, e = t.selectionEnd; const body = n.body.slice(0, s) + a + n.body.slice(s, e) + b + n.body.slice(e); save({ body }); setTimeout(() => { t.focus(); t.setSelectionRange(s + a.length, e + a.length); }, 0); };
  const pasteImg = async (f: File) => {
    // images are shrunk and kept in the note itself
    const img = await createImageBitmap(f); const k = Math.min(1, 1100 / img.width); const c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k; c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    wrap(`\n![image](${c.toDataURL("image/jpeg", 0.8)})\n`, "");
  };
  const ctx = `The note Reg has open (id ${n.id}, ${n.subject ?? ""} ${n.topic ?? ""}${n.spec_code ? ` spec ${n.spec_code}` : ""}):\n<note title="${String(n.title).replace(/"/g, "'")}">\n${String(n.body).replace(/!\[[^\]]*\]\(data:[^)]+\)/g, "[image]").slice(0, 9000)}\n</note>\nTo change the note use the update tool on notes with this id (keep his wording unless asked).`;
  const ask = (t: string) => { setChatOpen(true); setTimeout(() => document.getElementById(`note-chat-${n.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100); return submit(t, { mode: "tutor", space: `notes:${n.id}`, conversationId: chat, context: ctx }); };
  const words = String(n.body).split(/\s+/).filter(Boolean).length;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <input value={n.title} onChange={(e) => save({ title: e.target.value })} style={{ ...field, flex: "1 1 260px", height: 38, fontSize: 18, fontWeight: 600 }} />
        <button className="pill" data-active={n.pinned} onClick={() => save({ pinned: !n.pinned })}>📌</button>
        {COLORS.map((c) => <button key={c || "none"} title="Colour" onClick={() => save({ color: c || null })} style={{ width: 18, height: 18, borderRadius: 99, background: c || "var(--surface-2)", border: n.color === c ? "2px solid var(--text)" : "1px solid var(--border)" }} />)}
        <small className="label">{saved} · {words} words</small>
      </div>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <select value={n.subject ?? ""} onChange={(e) => save({ subject: e.target.value || null })} style={field}><option value="">No subject</option>{SUBJ.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={n.kind} onChange={(e) => save({ kind: e.target.value })} style={field}><option value="topic">Topic note</option><option value="lesson">Lesson note</option></select>
        <input value={n.topic ?? ""} onChange={(e) => save({ topic: e.target.value })} placeholder="Topic" style={{ ...field, width: 170 }} />
        <input value={n.spec_code ?? ""} onChange={(e) => save({ spec_code: e.target.value || null })} placeholder="Spec code" style={{ ...field, width: 100 }} />
        {n.kind === "lesson" && <input type="date" value={n.lesson_date ?? ""} onChange={(e) => save({ lesson_date: e.target.value || null })} style={field} />}
        <input value={(n.tags ?? []).join(", ")} onChange={(e) => save({ tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="tags, comma separated" style={{ ...field, width: 180 }} />
      </div>
      <div className={u.row} style={{ gap: 4, flexWrap: "wrap" }}>
        {[["edit", "Edit"], ["split", "Split"], ["read", "Read"]].map(([k, l]) => <button key={k} className="pill" data-active={mode === k} onClick={() => setMode(k as "edit")}>{l}</button>)}
        {mode !== "read" && <>
          <span style={{ width: 8 }} />
          <button className="pill" onClick={() => wrap("**")}><b>B</b></button>
          <button className="pill" onClick={() => wrap("*")}><i>I</i></button>
          <button className="pill" onClick={() => wrap("\n## ", "")}>H</button>
          <button className="pill" onClick={() => wrap("\n- ", "")}>• List</button>
          <button className="pill" onClick={() => wrap("$", "$")}>∑ maths</button>
          <button className="pill" onClick={() => wrap("\n$$\n", "\n$$\n")}>∑ block</button>
          <button className="pill" onClick={() => wrap("\n| A | B |\n|---|---|\n| ", " |  |\n")}>Table</button>
          <button className="pill" onClick={() => wrap("\n```mermaid\nflowchart LR\n  A --> B\n```\n", "")}>Diagram</button>
          <button className="pill" onClick={() => wrap("\n```plot\ny = x^2\nx: -5..5\n```\n", "")}>Graph</button>
          <button className="pill" onClick={() => wrap("\n- [ ] ", "")}>☐</button>
        </>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: mode === "split" ? "1fr 1fr" : "1fr", gap: 10 }}>
        {mode !== "read" && <textarea ref={area} value={n.body} onChange={(e) => save({ body: e.target.value })} onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); void pasteImg(f); } }}
          placeholder="Write here. Markdown and LaTeX work. Paste images straight in." style={{ minHeight: 440, padding: 12, borderRadius: 12, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", font: "14px/1.55 var(--font-mono, ui-monospace)", resize: "vertical" }} />}
        {mode !== "edit" && <div style={{ minHeight: 200, padding: 14, borderRadius: 12, background: "var(--surface)", overflowX: "auto" }} className="note-print"><RichText text={n.body || "_Empty note_"} /></div>}
      </div>
      <div className={u.row} style={{ gap: 4, flexWrap: "wrap" }}>
        <button className="pill" data-active="true" onClick={() => ask("Turn this note into flashcards following my flashcard instructions (settings.data.flashcard_instructions if set: read it with list_records on settings). Save them with create on flashcards (deck = the note's subject, topic, spec_code), then tell me how many you made.")}>⚡ Flashcards</button>
        <button className="pill" onClick={() => ask("Quiz me on this note: 5 questions, one at a time, mark each answer.")}>Quiz me</button>
        <button className="pill" onClick={() => ask("Explain the hardest part of this note more clearly, with an example.")}>Explain</button>
        <button className="pill" onClick={() => ask("Fill the gaps in this note against the spec (get_spec for its code) and add what's missing, clearly marked as added.")}>Fill gaps</button>
        <button className="pill" onClick={() => ask("Tidy this note: fix structure, headings and maths formatting without changing my meaning. Save it.")}>Tidy up</button>
        <button className="pill" onClick={() => ask("Rewrite this note in Cornell format (cues | notes table + summary) and save it.")}>→ Cornell</button>
        <button className="pill" onClick={() => ask("Make a one-screen summary of this note with the key formulas and common mistakes, and save it as a new topic note.")}>Summarise</button>
        <button className="pill" onClick={() => ask("Draw a diagram (```mermaid mind map or flowchart) of how the ideas in this note connect, and add it to the end of the note.")}>Mind map</button>
        <button className="pill" data-active={n.review} onClick={() => save({ review: !n.review })} title="Comes back in your spaced-repetition reviews">🔁 {n.review ? "In reviews" : "Add to reviews"}</button>
        <button className="pill" onClick={() => { const t = String(n.body).replace(/!\[[^\]]*\]\([^)]+\)/g, "").replace(/[#*`$|]/g, " "); const s = new SpeechSynthesisUtterance(`${n.title}. ${t}`); s.lang = "en-GB"; speechSynthesis.cancel(); speechSynthesis.speak(s); }}>🔊 Read aloud</button>
        <button className="pill" onClick={() => { const blob = new Blob([`# ${n.title}\n\n${n.body}`], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${n.title}.md`; a.click(); }}>⬇ .md</button>
        <button className="pill" onClick={() => window.print()}>🖨 Print / PDF</button>
        <button className="pill" onClick={async () => setVers((await api({ action: "versions", id })).versions)}>⟲ History</button>
        <button className="pill" onClick={async () => { if (confirm("Move this note to the bin?")) { await api({ action: "delete", id }); onDeleted(); } }}>🗑</button>
      </div>
      {vers && <div style={{ display: "grid", gap: 4, padding: 10, borderRadius: 10, background: "var(--surface)" }}>{!vers.length && <span className="label">No earlier versions yet.</span>}{vers.map((v) => <div key={v.i} className={u.row}><small className="label" style={{ flex: 1 }}>{new Date(v.at).toLocaleString("en-GB")} · {v.words} words · {v.preview}</small><button className="pill" onClick={async () => { await api({ action: "restore_version", id, i: v.i }); setVers(null); const j = await fetch(`/api/notes?id=${id}`).then((r) => r.json()); setN(j); }}>Restore</button></div>)}<button className="pill" onClick={() => setVers(null)} style={{ justifySelf: "start" }}>Close</button></div>}
      <div style={{ padding: 10, borderRadius: 12, background: "var(--surface)", display: "grid", gap: 6 }}>
        <span className="label">Links and videos for {n.topic || "this topic"}</span>
        {(n.resources ?? []).map((r: A) => <a key={r.id} href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>{/youtu/.test(r.url) ? "▶ " : "🔗 "}{r.title}</a>)}
        <div className={u.row} style={{ gap: 4, flexWrap: "wrap" }}>
          <input value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} placeholder="Title" style={{ ...field, width: 180 }} />
          <input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://… (YouTube, website)" style={{ ...field, flex: 1, minWidth: 180 }} />
          <button className="pill" disabled={!/^https?:\/\//.test(link.url)} onClick={async () => { const r = await api({ action: "link", id, ...link }); setN({ ...n, resources: [...(n.resources ?? []), r] }); setLink({ title: "", url: "" }); }}>Add</button>
          <button className="pill" onClick={() => ask("Find 3 good free resources (videos and pages) for this note's topic at A-level and save them to resource_links with subject, topic and spec_code.")}>Find some for me</button>
        </div>
      </div>
      <details open={chatOpen} onToggle={(e) => setChatOpen((e.target as HTMLDetailsElement).open)} id={`note-chat-${n.id}`}>
        <summary className="label" style={{ cursor: "pointer" }}>Chat about this note (Apollo&apos;s answers to the buttons above appear here)</summary>
        <div style={{ marginTop: 8 }}><RoomChat space={`notes:${n.id}`} conversationId={chat} onConversation={setChat} mode="tutor" context={ctx} height={380} /></div>
      </details>
    </div>
  );
}
