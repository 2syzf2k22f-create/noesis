"use client";
// Language conversation practice: speak (mic or Alt+P), Apollo answers aloud in the language,
// corrects you and teaches a word. Each session is kept here, not in Chats.

import { useEffect, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { usePersist } from "./usePersist";
import u from "./ui.module.css";

type Msg = { id: string; role: string; content: string; at?: string };
type Sess = { id: string; title: string; updatedAt: string; space: string };
const LANGS = [{ id: "Spanish", flag: "ES", level: "A1-A2" }, { id: "French", flag: "FR", level: "refresh, towards B1-B2" }, { id: "Mandarin", flag: "中", level: "HSK 1, with pinyin" }];
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

export function LanguageConversation() {
  const { submit, reply, changes, toggleMic, orbState, draft, setVoiceTarget } = useApollo();
  const [lang, setLang] = usePersist("lang.current", "Spanish");
  const [session, setSession] = usePersist<Record<string, string>>("lang.session", {});
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [view, setView] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const thread = `lang:${lang}:${session[lang] ?? "first"}`;

  // spoken input on this page goes to the language session, and replies are read aloud
  useEffect(() => { setVoiceTarget({ mode: "conversation", thread }); return () => setVoiceTarget(null); }, [thread, setVoiceTarget]);
  useEffect(() => {
    fetch(`/api/chats?space=${encodeURIComponent(`lang:${lang}`)}`).then((r) => (r.ok ? r.json() : [])).then(setSessions).catch(() => {});
  }, [lang, changes, reply?.pending]);
  const current = sessions.find((x) => x.space === thread);
  const shown = view ? sessions.find((x) => x.id === view) : current;
  useEffect(() => {
    if (!shown) { queueMicrotask(() => setMsgs([])); return; }
    fetch(`/api/chats/${shown.id}`).then((r) => (r.ok ? r.json() : null)).then((j) => setMsgs(j?.messages ?? [])).catch(() => {});
  }, [shown?.id, changes, reply?.pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = (t: string) => { if (t.trim()) submit(`Language: ${lang}. ${t.trim()}`, { mode: "conversation", thread }); };
  const listening = orbState === "listening";
  const L = LANGS.find((x) => x.id === lang)!;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 240px", gap: 14 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div className={u.row}>
          {LANGS.map((x) => <button key={x.id} className="pill" data-active={lang === x.id} onClick={() => { setLang(x.id); setView(null); }}>{x.flag} {x.id}</button>)}
          <span className="label">{L.level}</span>
          <button className="pill" onClick={() => { setSession({ ...session, [lang]: stamp() }); setView(null); }}>New session</button>
        </div>
        <div style={{ minHeight: 260, maxHeight: 460, overflow: "auto", display: "grid", gap: 8, alignContent: "start", padding: 10, borderRadius: 12, background: "var(--surface)" }}>
          {!msgs.length && !view && <p className="label">Press the mic (or Alt+P), say something in {lang} (or in English to start), press again to send. Apollo answers out loud, corrects you, and teaches a new word each turn.</p>}
          {msgs.map((m) => (
            <div key={m.id} style={{ justifySelf: m.role === "user" ? "end" : "start", maxWidth: "85%", padding: "8px 12px", borderRadius: 12, background: m.role === "user" ? "var(--accent)" : "var(--surface-2)", color: m.role === "user" ? "var(--on-accent)" : undefined, whiteSpace: "pre-wrap", fontSize: 14.5 }}>
              {m.role === "user" ? m.content.replace(/^Language: \w+\.\s*/, "") : m.content}
            </div>
          ))}
          {!view && reply?.pending && <div style={{ padding: "8px 12px", borderRadius: 12, background: "var(--surface-2)", opacity: 0.8 }}>{reply.text || "…"}</div>}
        </div>
        {view ? <button className="pill" onClick={() => setView(null)}>Back to the current session</button> : (
          <div className={u.row} style={{ justifyContent: "center" }}>
            <button onClick={toggleMic} aria-label={listening ? "Stop and send" : "Start talking"}
              style={{ width: 72, height: 72, borderRadius: "50%", background: listening ? "var(--danger)" : "var(--accent)", color: "var(--on-accent)", fontSize: 26, boxShadow: listening ? "0 0 0 8px color-mix(in srgb, var(--danger) 25%, transparent)" : "var(--glow)" }}>
              {listening ? "■" : "🎙"}
            </button>
            <div style={{ minWidth: 200, maxWidth: 420 }}>
              <span className="label">{listening ? "Listening… press again (or Alt+P) to send" : "Tap to talk · Alt+P works too"}</span>
              {draft && <div style={{ fontSize: 14 }}>{draft}</div>}
            </div>
            <button className="pill" onClick={() => setTyping(!typing)}>{typing ? "Hide keyboard" : "Type instead"}</button>
          </div>
        )}
        {typing && !view && (
          <div className={u.row}>
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { send(text); setText(""); } }} placeholder={`Write in ${lang}…`}
              style={{ flex: 1, height: 36, padding: "0 10px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
            <button className="pill" data-active="true" onClick={() => { send(text); setText(""); }}>Send</button>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
        <span className="label">{lang} sessions</span>
        {sessions.map((x) => (
          <button key={x.id} className="pill" data-active={(view ?? current?.id) === x.id} onClick={() => setView(x.id === current?.id ? null : x.id)} style={{ textAlign: "left" }}>
            {new Date(x.updatedAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}{x.id === current?.id ? " · now" : ""}
          </button>
        ))}
        {!sessions.length && <small className="label">None yet.</small>}
      </div>
    </div>
  );
}
