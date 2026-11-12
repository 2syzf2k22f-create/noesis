"use client";

import { useRef, useState } from "react";
import { MODEL_PREFS } from "@/core/routing";
import { biggerModel, useApollo } from "./apollo";
import { Icon } from "./Icon";
import s from "./shell.module.css";

const cap = (m: string) => m[0].toUpperCase() + m.slice(1);

/** Home: the only control on the page. Extra controls appear only when they're relevant. */
export function CommandBar() {
  const { submit, toggleMic, orbState, reply, micError, setPaletteOpen, model, setModel, status, changes, undoApollo, startListening, stopListening, draft, voice } = useApollo();
  const [text, setText] = useState("");
  // tap = toggle; hold (>300 ms) = push-to-talk, sends on release
  const press = useRef<{ t: number; held: boolean; timer: number } | null>(null);
  const down = () => {
    const timer = window.setTimeout(() => { if (press.current) { press.current.held = true; startListening(); } }, 300);
    press.current = { t: Date.now(), held: false, timer };
  };
  const up = () => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    window.clearTimeout(p.timer);
    if (p.held) stopListening(); else toggleMic();
  };
  const said = reply?.text || (reply?.pending ? "" : null) || (micError ? `${micError}.` : null);
  const offline = status?.configured && status.relay && !status.relay.online;
  const bigger = reply?.model && !reply.pending && reply.ask ? biggerModel(reply.model) : null;

  return (
    <div className={s.commandWrap}>
      <div className={s.reply} aria-live="polite" data-show={!!said || !!reply?.pending} data-tone={reply?.tone}>
        <p>{said || (reply?.pending ? "…" : " ")}</p>
        {reply?.model && !reply.pending && (
          <div className={`label ${s.replyMeta}`}>
            <span>{cap(reply.model)}{reply.escalated ? " · escalated" : ""}</span>
            {bigger && (
              <button onClick={() => submit(reply.ask!, { model: bigger })}>Retry with {cap(bigger)}</button>
            )}
          </div>
        )}
      </div>
      <form className={`panel ${s.command}`} onSubmit={(e) => { e.preventDefault(); submit(text); setText(""); }}>
        {offline && <span className={s.offline} title="Relay offline: messages queue until your PC is on" />}
        <input value={draft || text} onChange={(e) => setText(e.target.value)} placeholder={orbState === "listening" ? "Listening…" : voice.wake ? "Ask Apollo, or say “Apollo”" : "Ask Apollo"} aria-label="Message Apollo" autoComplete="off" readOnly={!!draft} />
        {changes > 0 && (
          <button type="button" className={s.ghost} onClick={() => undoApollo()} aria-label="Undo Apollo" title="Undo Apollo">
            <Icon name="undo" size={16} />
          </button>
        )}
        <button
          type="button"
          className={s.model}
          onClick={() => setModel(MODEL_PREFS[(MODEL_PREFS.indexOf(model) + 1) % MODEL_PREFS.length])}
          title="Model: Auto starts on Haiku and escalates"
          aria-label={`Model: ${cap(model)}. Click to change`}
        >
          {cap(model)}
        </button>
        <button type="button" className={s.kbd} onClick={() => setPaletteOpen(true)} aria-label="Open command palette">⌘K</button>
        <button type="button" className={s.mic} aria-pressed={orbState === "listening"} aria-label={orbState === "listening" ? "Stop listening" : "Talk (tap, or hold to talk)"}
          title="Tap to talk, or hold. You can also hold Space."
          onPointerDown={down} onPointerUp={up} onPointerLeave={() => { if (press.current?.held) up(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); toggleMic(); } }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          </svg>
        </button>
      </form>
    </div>
  );
}
