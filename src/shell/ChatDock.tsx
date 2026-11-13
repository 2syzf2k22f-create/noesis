"use client";
// The ever-present chatbox beside the docked orb. Ask about anything on screen (it sends
// a description of the page with each question), or anything at all, or "take me to…".
// Apollo can move/resize it, open it next to something it's explaining, and highlight things.

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApollo } from "./apollo";
import { Icon } from "./Icon";
import { findTarget, uiStore, useUi, type Box } from "./uiStore";
import { shrinkImage } from "./images";
import s from "./dock.module.css";

type Msg = { id: string; role: string; content: string };
const DEFAULT_BOX: Box = { x: 104, y: 12, w: 400, h: 480 };

export function ChatDock() {
  const pathname = usePathname();
  const { submit, reply, activeConv, chatId, changes, toggleMic, orbState, draft, openChat, notice, stopSpeaking } = useApollo();
  const ui = useUi();
  const [text, setText] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const drag = useRef<{ mode: "move" | "size"; sx: number; sy: number; b: Box } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const open = ui.chat.open;
  const box = ui.chat.box ?? DEFAULT_BOX;
  const conv = activeConv ?? chatId;

  // load the conversation when opened, and after each reply
  useEffect(() => {
    if (!open || !conv) return;
    let live = true;
    fetch(`/api/chats/${conv}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j?.messages) setMsgs(j.messages.slice(-40)); }).catch(() => {});
    return () => { live = false; };
  }, [open, conv, changes, reply?.pending]);

  // a new answer opens the box
  useEffect(() => { if (reply?.pending && pathname !== "/") uiStore.setChat({ open: true }); }, [reply?.pending, pathname]);
  useLayoutEffect(() => { list.current?.scrollTo({ top: 1e9 }); }, [msgs, reply?.text, open]);
  // "/" focuses the box
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "/" || (e.target as HTMLElement)?.closest?.("input,textarea,select,[contenteditable]")) return;
      e.preventDefault(); uiStore.setChat({ open: true }); setTimeout(() => input.current?.focus(), 30);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  if (pathname === "/") return null;

  const send = () => {
    const t = text.trim();
    if (!t && !imgs.length) return;
    setText("");
    const pics = imgs;
    setImgs([]);
    setMsgs((m) => [...m, { id: `local-${m.length}`, role: "user", content: `${t}${pics.length ? ` [${pics.length} image${pics.length > 1 ? "s" : ""}]` : ""}` }]);
    uiStore.setChat({ open: true });
    submit(t, pics.length ? { images: pics } : undefined);
  };
  const addFiles = async (files: Iterable<File>) => {
    const out: string[] = [];
    for (const f of files) if (f.type.startsWith("image/")) out.push(await shrinkImage(f));
    if (out.length) { setImgs((x) => [...x, ...out].slice(0, 4)); uiStore.setChat({ open: true }); }
  };
  const begin = (mode: "move" | "size", e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,textarea")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, b: box };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy, vw = window.innerWidth, vh = window.innerHeight;
    uiStore.setChat({ box: d.mode === "move"
      ? { ...d.b, x: Math.max(0, Math.min(vw - 120, d.b.x + dx)), y: Math.max(0, Math.min(vh - 60, d.b.y + dy)) }
      : { ...d.b, w: Math.max(280, Math.min(vw - d.b.x - 8, d.b.w + dx)), h: Math.max(180, Math.min(vh - d.b.y - 8, d.b.h + dy)) } });
  };
  const end = () => { drag.current = null; };
  const live = reply && (reply.pending || reply.text) ? reply : null;
  const shown = msgs.filter((m) => !(live && !live.pending && m.role === "assistant" && m.content === live.text));

  const inputRow = (
    <div className={s.inputWrap} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void addFiles(e.dataTransfer.files); }}>
    {imgs.length > 0 && (
      <div className={s.thumbs}>
        {imgs.map((src, i) => (
          <span key={i} className={s.thumb}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" />
            <button onClick={() => setImgs(imgs.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
          </span>
        ))}
      </div>
    )}
    <div className={s.inputRow}>
      <label className={s.mic} title="Attach a picture (or paste / drop one)" style={{ cursor: "pointer" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></svg>
        <input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
      </label>
      <textarea ref={input} rows={1} value={draft || text} placeholder={orbState === "listening" ? "Listening… (Alt+P again to send)" : "Ask Apollo anything, or paste a screenshot  ( / )"}
        onPaste={(e) => { const fs = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/")); if (fs.length) { e.preventDefault(); void addFiles(fs); } }}
        onChange={(e) => setText(e.target.value)} onFocus={() => uiStore.setChat({ open: true })}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === "Escape") { (e.target as HTMLElement).blur(); uiStore.setChat({ open: false }); } }} />
      {orbState === "speaking" && <button className={s.mic} onClick={stopSpeaking} title="Stop talking (Esc)" aria-label="Stop talking">■</button>}
      <button className={s.mic} data-on={orbState === "listening"} onClick={toggleMic} aria-label="Talk"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg></button>
      <button className={s.send} onClick={send} aria-label="Send" disabled={!text.trim() && !imgs.length}>↑</button>
    </div>
    </div>
  );

  if (!open)
    return (
      <div className={s.collapsed} data-chatdock data-ui="chatdock">
        {inputRow}
      </div>
    );

  return (
    <section className={s.dock} data-chatdock data-ui="chatdock" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} aria-label="Apollo chat">
      <header className={s.head} onPointerDown={(e) => begin("move", e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <i className={s.dot} data-state={orbState} />
        <b>Apollo</b>
        <span className={s.headTools}>
          {orbState === "speaking" && <button onClick={stopSpeaking} title="Stop talking (Esc)" style={{ color: "var(--danger)" }}>■ Stop</button>}
          <button onClick={() => { openChat(null); setMsgs([]); }} title="New chat">New</button>
          <button onClick={() => uiStore.setChat({ box: null })} title="Back beside the orb">Reset</button>
          <button onClick={() => uiStore.setChat({ open: false })} aria-label="Collapse"><Icon name="close" size={14} /></button>
        </span>
      </header>
      <div className={s.msgs} ref={list}>
        {shown.length === 0 && !live && (
          <div className={s.hint}>
            <p>Ask about anything on this page (“explain this graph”, “why was that move a blunder?”), anything in general, or say “open poker side by side”.</p>
            <p>Press <kbd>/</kbd> to type from anywhere.</p>
          </div>
        )}
        {shown.map((m) => <div key={m.id} className={s.msg} data-role={m.role}>{m.content}</div>)}
        {notice && <div className="label" style={{ textAlign: "center" }}>{notice}</div>}
        <Proposals />
        {live && <div className={s.msg} data-role="assistant" data-pending={live.pending} data-tone={live.tone}>{live.text || "…"}</div>}
      </div>
      {inputRow}
      <span className={s.grip} onPointerDown={(e) => begin("size", e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-hidden />
    </section>
  );
}

/** Apollo's proposed code changes: one click to build (nothing runs without it). */
function Proposals() {
  const { changes, reply } = useApollo();
  const [list, setList] = useState<{ id: string; title: string | null; request: string }[]>([]);
  useEffect(() => {
    fetch("/api/build").then((r) => (r.ok ? r.json() : null)).then((j) => setList((j?.builds ?? []).filter((b: { status: string }) => b.status === "proposed"))).catch(() => {});
  }, [changes, reply?.pending]);
  const act = async (id: string, action: string) => { await fetch(`/api/build/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }); setList((l) => l.filter((x) => x.id !== id)); };
  if (!list.length) return null;
  return (
    <>
      {list.map((b) => (
        <div key={b.id} className={s.msg} data-role="assistant" style={{ borderLeft: "3px solid var(--accent)" }}>
          <b>Proposed change to NOESIS</b>{b.title ? `: ${b.title}` : ""}
          <details><summary className="label" style={{ cursor: "pointer" }}>What it would do</summary><div style={{ whiteSpace: "pre-wrap", fontSize: 12.5 }}>{b.request}</div></details>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button className="pill" data-active="true" onClick={() => act(b.id, "approve")}>Build it</button>
            <button className="pill" onClick={() => act(b.id, "decline")}>No thanks</button>
          </div>
        </div>
      ))}
    </>
  );
}

/** Glowing rings Apollo draws around things to show where they are. */
export function Highlighter() {
  const ui = useUi();
  const [rects, setRects] = useState<{ id: number; r: DOMRect | null; label?: string }[]>([]);
  const scrolled = useRef(new Set<number>());
  useEffect(() => {
    if (!ui.highlights.length) { queueMicrotask(() => setRects([])); return; }
    let raf = 0;
    const tick = () => {
      setRects(ui.highlights.map((h) => {
        const el = findTarget(h.target);
        if (el && !scrolled.current.has(h.id)) { scrolled.current.add(h.id); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
        return { id: h.id, r: el?.getBoundingClientRect() ?? null, label: h.label };
      }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ui.highlights]);
  return (
    <>
      {rects.filter((x) => x.r).map((x) => (
        <div key={x.id} className={s.ring} style={{ left: x.r!.left - 6, top: x.r!.top - 6, width: x.r!.width + 12, height: x.r!.height + 12 }} onClick={() => uiStore.unhighlight(x.id)}>
          {x.label && <span className={s.ringLabel} data-below={x.r!.top < 60}>{x.label}</span>}
        </div>
      ))}
    </>
  );
}
