"use client";

import { useState } from "react";
import { MODEL_PREFS } from "@/core/routing";
import { biggerModel, useApollo } from "./apollo";
import { Icon } from "./Icon";
import s from "./shell.module.css";

const cap = (m: string) => m[0].toUpperCase() + m.slice(1);

/** Home: the only control on the page. Extra controls appear only when they're relevant. */
export function CommandBar() {
  const { submit, toggleMic, orbState, reply, micError, setPaletteOpen, model, setModel, status, changes, undoApollo } = useApollo();
  const [text, setText] = useState("");
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
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Apollo" aria-label="Message Apollo" autoComplete="off" />
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
        <button type="button" className={s.mic} aria-pressed={orbState === "listening"} aria-label={orbState === "listening" ? "Stop listening" : "Talk"} onClick={toggleMic}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          </svg>
        </button>
      </form>
    </div>
  );
}
