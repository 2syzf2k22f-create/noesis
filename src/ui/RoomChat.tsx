"use client";
// A chat that lives ON a page (tutor rooms, lessons, notes, the revision timetable, documents) instead of the
// floating chat box. Its conversations are saved under the page's space and resume where they stopped.
// Photos of working (camera, paste, drag and drop), a drawing pad, documents, the mic, quick actions,
// full rich display (maths, diagrams, graphs, quizzes), and scrolling that stays where you put it.
import { useCallback, useEffect, useRef, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { readAttachment, type Attached } from "@/shell/files";
import { RichText } from "./RichText";
import { MathPreview } from "./MathTools";
import { useStickyScroll } from "./useStickyScroll";
import u from "./ui.module.css";

type Msg = { id: string; role: string; content: string };
export type QuickAction = { label: string; text: string; title?: string };

export function RoomChat({ space, conversationId, onConversation, context, mode = "tutor", quick = [], placeholder, height = 520, empty, onSent }: {
  space: string; conversationId: string | null; onConversation: (id: string) => void; context?: string; mode?: string;
  quick?: QuickAction[]; placeholder?: string; height?: number | string; empty?: React.ReactNode; onSent?: (text: string) => void;
}) {
  const { submit, reply, changes, toggleMic, orbState, draft, setVoiceTarget } = useApollo();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [docs, setDocs] = useState<Attached[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [tick, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const mine = reply && reply.origin === space ? reply : null;
  const live = mine && (mine.pending || mine.text) ? mine : null;
  const { ref, away, jump } = useStickyScroll<HTMLDivElement>([msgs, live?.text]);

  // the server makes the conversation on the first message; pick its id up
  useEffect(() => {
    const f = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.space === space && d.id && d.id !== conversationId) onConversation(d.id); };
    window.addEventListener("noesis:room-conversation", f); return () => window.removeEventListener("noesis:room-conversation", f);
  }, [space, conversationId, onConversation]);
  useEffect(() => {
    if (!conversationId) { queueMicrotask(() => setMsgs([])); return; }
    let ok = true;
    fetch(`/api/chats/${conversationId}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (ok && j?.messages) setMsgs(j.messages); }).catch(() => {});
    return () => { ok = false; };
  }, [conversationId, changes, mine?.pending, tick]);
  // replies that finish later (after a PC approval etc.)
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 8000); return () => clearInterval(t); }, []);
  // speaking on this page talks to this room
  useEffect(() => { setVoiceTarget({ mode, space, conversationId, context }); return () => setVoiceTarget(null); }, [mode, space, conversationId, context, setVoiceTarget]);

  const send = useCallback((t: string, extra?: { images?: string[] }) => {
    const pics = extra?.images ?? imgs, ds = docs;
    if (!t.trim() && !pics.length && !ds.length) return;
    setMsgs((m) => [...m, { id: `l${Date.now()}`, role: "user", content: `${t}${pics.length ? ` [${pics.length} image${pics.length > 1 ? "s" : ""}]` : ""}${ds.map((d) => ` [file: ${d.name}]`).join("")}` }]);
    setText(""); setImgs([]); setDocs([]);
    submit(t.trim() || "Here's my working: mark it line by line.", { mode, space, conversationId, context, images: pics, files: ds.map((d) => ({ name: d.name, kind: d.kind, text: d.text ?? "" })) });
    onSent?.(t);
  }, [imgs, docs, submit, mode, space, conversationId, context, onSent]);
  const add = async (files: Iterable<File>) => {
    for (const f of files) {
      const a = await readAttachment(f).catch(() => null);
      if (!a) continue;
      if (a.kind === "image" && a.image) setImgs((x) => [...x, a.image!].slice(0, 4)); else setDocs((x) => [...x, a].slice(0, 5));
    }
  };
  const listening = orbState === "listening";
  return (
    <div style={{ display: "grid", gridTemplateRows: "1fr auto", height, minHeight: 280, border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface)", position: "relative" }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void add(e.dataTransfer.files); }}>
      <div ref={ref} style={{ overflowY: "auto", padding: 12, display: "grid", gap: 10, alignContent: "start" }}>
        {!msgs.length && !live && (empty ?? <p className="label">Ask anything. You can send a photo of your working (📷), draw it (✏️) or talk (🎙).</p>)}
        {msgs.map((m) => (
          <div key={m.id} style={{ justifySelf: m.role === "user" ? "end" : "stretch", maxWidth: m.role === "user" ? "85%" : "100%", padding: m.role === "user" ? "8px 12px" : "4px 2px", borderRadius: 12, background: m.role === "user" ? "color-mix(in srgb, var(--accent) 18%, var(--surface-2))" : undefined }}>
            <RichText text={m.role === "user" ? m.content.replace(/^\[[^\]]+\]\s*/, "") : m.content} />
          </div>
        ))}
        {live && <div style={{ padding: "4px 2px", opacity: live.pending ? 0.92 : 1 }}>{live.text ? <RichText text={live.text} /> : <span className="label">Thinking…</span>}</div>}
      </div>
      {away && <button className="pill" onClick={jump} style={{ position: "absolute", bottom: 120, left: "50%", transform: "translateX(-50%)", height: 26, fontSize: 12, zIndex: 2 }}>↓ Jump to latest</button>}
      <div style={{ borderTop: "1px solid var(--border)", padding: 8, display: "grid", gap: 6 }}>
        {quick.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{quick.map((q) => <button key={q.label} className="pill" title={q.title} style={{ height: 26, fontSize: 12 }} onClick={() => send(q.text, { images: [] })}>{q.label}</button>)}</div>}
        {(imgs.length > 0 || docs.length > 0) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {imgs.map((s, i) => <span key={i} style={{ position: "relative" }}><img src={s} alt="attached" style={{ height: 56, borderRadius: 6 }} /><button onClick={() => setImgs((x) => x.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, borderRadius: 99, width: 18, height: 18, fontSize: 10 }}>×</button></span>)}
            {docs.map((d, i) => <span key={i} className="pill" style={{ height: 24, fontSize: 11 }}>{d.name} <button onClick={() => setDocs((x) => x.filter((_, j) => j !== i))} style={{ background: "none", border: 0, color: "inherit" }}>×</button></span>)}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <textarea value={draft && listening ? draft : text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={placeholder ?? "Type, paste a photo, or use the mic…"}
            onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); void add(fs); } }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
            style={{ flex: 1, resize: "vertical", minHeight: 40, maxHeight: 200, padding: 8, borderRadius: 10, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", font: "14px var(--font-body)" }} />
          <input ref={fileRef} type="file" accept="image/*,.pdf,.docx,.txt,.md,.csv" capture={undefined} multiple hidden onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = ""; }} />
          <button className="pill" title="Photo of your working, or a file (you can also paste or drag one in)" onClick={() => fileRef.current?.click()} style={{ height: 40 }}>📷</button>
          <button className="pill" title="Draw your working" onClick={() => setDrawing(true)} style={{ height: 40 }}>✏️</button>
          <button className="pill" title={listening ? "Stop and send" : "Talk"} onClick={toggleMic} style={{ height: 40, background: listening ? "var(--danger)" : undefined }}>{listening ? "■" : "🎙"}</button>
          <button className="pill" data-active="true" onClick={() => send(text)} style={{ height: 40 }}>Send</button>
        </div>
        {/[$\\]/.test(text) && <MathPreview value={text} />}
      </div>
      {drawing && <DrawPad onClose={() => setDrawing(false)} onDone={(png) => { setDrawing(false); setImgs((x) => [...x, png].slice(0, 4)); }} />}
    </div>
  );
}

/** A simple drawing pad (pen, eraser, colours, undo): the drawing is sent as a picture of your working. */
export function DrawPad({ onClose, onDone }: { onClose: () => void; onDone: (png: string) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState("#111111");
  const [size, setSize] = useState(3);
  const hist = useRef<ImageData[]>([]);
  const drawing = useRef(false);
  useEffect(() => { const c = cv.current!; const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }, []);
  const pt = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.current!.width / r.width), (e.clientY - r.top) * (cv.current!.height / r.height)]; };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 340, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ background: "var(--bg)", padding: 12, display: "grid", gap: 8, width: "min(920px, 96vw)" }}>
        <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
          <b style={{ flex: 1 }}>Draw your working</b>
          {["#111111", "#1e5bd8", "#d83a3a", "#1f9d55"].map((c) => <button key={c} onClick={() => { setColor(c); setSize(3); }} style={{ width: 22, height: 22, borderRadius: 99, background: c, border: color === c ? "2px solid var(--accent)" : "1px solid #888" }} />)}
          <button className="pill" onClick={() => { setColor("#ffffff"); setSize(18); }}>Eraser</button>
          <button className="pill" onClick={() => { const c = cv.current!.getContext("2d")!; const h = hist.current.pop(); if (h) c.putImageData(h, 0, 0); }}>Undo</button>
          <button className="pill" onClick={() => { const c = cv.current!; const g = c.getContext("2d")!; hist.current.push(g.getImageData(0, 0, c.width, c.height)); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }}>Clear</button>
          <button className="pill" data-active="true" onClick={() => onDone(cv.current!.toDataURL("image/png"))}>Attach</button>
        </div>
        <canvas ref={cv} width={1400} height={850} style={{ width: "100%", background: "#fff", borderRadius: 8, touchAction: "none", cursor: "crosshair" }}
          onPointerDown={(e) => { const c = cv.current!; const g = c.getContext("2d")!; hist.current.push(g.getImageData(0, 0, c.width, c.height)); if (hist.current.length > 30) hist.current.shift(); drawing.current = true; const [x, y] = pt(e); g.beginPath(); g.moveTo(x, y); c.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (!drawing.current) return; const g = cv.current!.getContext("2d")!; const [x, y] = pt(e); g.lineTo(x, y); g.strokeStyle = color; g.lineWidth = size * (e.pressure ? 0.5 + e.pressure : 1); g.lineCap = "round"; g.lineJoin = "round"; g.stroke(); }}
          onPointerUp={() => { drawing.current = false; }} />
      </div>
    </div>
  );
}
